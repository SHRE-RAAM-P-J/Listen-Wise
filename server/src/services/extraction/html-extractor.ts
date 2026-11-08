import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import * as cheerio from 'cheerio';
import {
  StructuredContent,
  ContentSection,
  ContentBlock,
  BlockType,
} from '../../models/structured-content.js';
import { safeFetchUrl } from '../../utils/url-security.js';
import { AppError } from '../../middleware/error-handler.js';
import { performance } from 'node:perf_hooks';

/**
 * Extracts and converts an HTML document into the canonical structured representation (CCR).
 */
export async function extractFromUrl(urlStr: string): Promise<StructuredContent> {
  const startedAt = performance.now();
  // Step 1: Safely fetch the HTML with SSRF protection, size & timeout enforcement
  const { finalUrl, html } = await safeFetchUrl(urlStr);

  const content = parseHtmlToStructuredContent(html, finalUrl);
  console.info(`[Timing] Webpage extraction service completed in ${Math.round(performance.now() - startedAt)}ms.`);
  return content;
}

export function parseHtmlToStructuredContent(
  html: string,
  sourceUrl?: string,
): StructuredContent {
  // Step 2: Use JSDOM and Mozilla Readability to distill the primary article content
  let dom: JSDOM;
  try {
    dom = new JSDOM(html, { url: sourceUrl || 'https://listenwise.local' });
  } catch (err: any) {
    throw new AppError('Failed to parse document HTML into DOM.', 400, 'HTML_PARSE_ERROR');
  }

  const reader = new Readability(dom.window.document, {
    charThreshold: 20,
  });

  const article = reader.parse();

  // If Readability could not find an article, fall back to body parsing
  const title = (article?.title || dom.window.document.title || 'Untitled Document').trim();
  const authors = article?.byline
    ? [article.byline.replace(/^by\s+/i, '').trim()]
    : undefined;
  const description = article?.excerpt?.trim() || undefined;

  // Use the cleaned HTML from Readability if available, or fall back to body
  const articleHtml = article?.content || dom.window.document.body?.innerHTML || html;
  const $ = cheerio.load(articleHtml);

  // Clean out any lingering script/style/iframe tags
  $('script, style, iframe, noscript, svg, nav, header, footer').remove();

  const sections: ContentSection[] = [];
  const sourceReferences: string[] = [];
  let currentSection: ContentSection = {
    heading: undefined,
    headingLevel: undefined,
    blocks: [],
  };

  // Helper to commit current section if it has blocks or heading
  const commitCurrentSection = () => {
    if (currentSection.blocks.length > 0 || currentSection.heading) {
      sections.push(currentSection);
      currentSection = {
        heading: undefined,
        headingLevel: undefined,
        blocks: [],
      };
    }
  };

  // Traverse the content elements in reading order
  // We inspect direct children and key content nodes
  const rootElements = $('body').children().length > 0 ? $('body').children() : $.root().children();

  function processElement(el: any) {
    if (el.type === 'tag') {
      const tagName = el.tagName.toLowerCase();

      // Heading elements create section boundaries
      if (/^h[1-6]$/.test(tagName)) {
        const level = parseInt(tagName.substring(1), 10);
        const headingText = $(el).text().trim();
        if (headingText) {
          commitCurrentSection();
          currentSection.heading = headingText;
          currentSection.headingLevel = level;
        }
        return;
      }

      // Mathematical formulas / equations (top level or tag)
      if (
        tagName === 'math' ||
        $(el).hasClass('katex') ||
        $(el).hasClass('math') ||
        $(el).attr('data-math')
      ) {
        const formula = $(el).attr('data-math') || $(el).text().trim();
        if (formula) {
          currentSection.blocks.push({
            type: 'equation',
            content: formula,
          });
        }
        return;
      }

      // Paragraphs
      if (tagName === 'p') {
        const mathChild = $(el).find('math, .katex, .math, [data-math]').first();
        if (mathChild.length > 0) {
          const formula = mathChild.attr('data-math') || mathChild.text().trim();
          if (formula) {
            currentSection.blocks.push({
              type: 'equation',
              content: formula,
            });
          }
        }

        const text = $(el).text().trim();
        if (text && (!mathChild.length || text !== mathChild.text().trim())) {
          currentSection.blocks.push({
            type: 'paragraph',
            content: text,
          });
        }

        // Collect citations/links
        $(el).find('a[href]').each((_, a) => {
          const href = $(a).attr('href');
          if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
            try {
              const fullUrl = new URL(href, sourceUrl || 'https://listenwise.local').toString();
              if (!sourceReferences.includes(fullUrl)) {
                sourceReferences.push(fullUrl);
              }
            } catch {
              // ignore invalid relative url
            }
          }
        });
        return;
      }

      // Lists (ordered / unordered)
      if (tagName === 'ul' || tagName === 'ol') {
        const items: string[] = [];
        $(el).children('li').each((_, li) => {
          const itemText = $(li).text().trim();
          if (itemText) items.push(itemText);
        });

        if (items.length > 0) {
          currentSection.blocks.push({
            type: tagName === 'ol' ? 'ordered-list' : 'unordered-list',
            content: items.join('\n'),
            items,
          });
        }
        return;
      }

      // Blockquotes
      if (tagName === 'blockquote') {
        const quoteText = $(el).text().trim();
        if (quoteText) {
          currentSection.blocks.push({
            type: 'quote',
            content: quoteText,
          });
        }
        return;
      }

      // Preformatted / Code blocks
      if (tagName === 'pre') {
        const codeEl = $(el).find('code');
        const codeText = codeEl.length ? codeEl.text() : $(el).text();
        const className = codeEl.attr('class') || $(el).attr('class') || '';
        const langMatch = className.match(/language-([\w-]+)/);
        const language = langMatch ? langMatch[1] : undefined;

        if (codeText.trim()) {
          currentSection.blocks.push({
            type: 'code',
            content: codeText.trim(),
            language,
          });
        }
        return;
      }

      // Tables: Extract rows and cells cleanly into 2D tableData
      if (tagName === 'table') {
        const rows: string[][] = [];
        $(el).find('tr').each((_, tr) => {
          const rowCells: string[] = [];
          $(tr).find('th, td').each((_, cell) => {
            rowCells.push($(cell).text().trim());
          });
          if (rowCells.some((c) => c.length > 0)) {
            rows.push(rowCells);
          }
        });

        if (rows.length > 0) {
          const tableSummary = rows.map((r) => r.join(' | ')).join('\n');
          currentSection.blocks.push({
            type: 'table',
            content: tableSummary,
            tableData: rows,
          });
        }
        return;
      }

      // Figures and Images with Captions
      if (tagName === 'figure') {
        const img = $(el).find('img').first();
        const caption = $(el).find('figcaption').text().trim();
        const src = img.attr('src') || img.attr('data-src');
        const alt = img.attr('alt') || '';

        if (src) {
          let resolvedSrc = src;
          try {
            resolvedSrc = new URL(src, sourceUrl || 'https://listenwise.local').toString();
          } catch {
            // keep raw src
          }

          currentSection.blocks.push({
            type: 'image',
            content: alt || caption || 'Image illustration',
            url: resolvedSrc,
            alt,
            note: caption ? `Caption: ${caption}` : undefined,
          });

          if (caption) {
            currentSection.blocks.push({
              type: 'image-caption',
              content: caption,
            });
          }
        }
        return;
      }

      // Standalone img
      if (tagName === 'img') {
        const src = $(el).attr('src') || $(el).attr('data-src');
        const alt = $(el).attr('alt') || '';
        if (src) {
          let resolvedSrc = src;
          try {
            resolvedSrc = new URL(src, sourceUrl || 'https://listenwise.local').toString();
          } catch {
            // keep
          }
          currentSection.blocks.push({
            type: 'image',
            content: alt || 'Image illustration',
            url: resolvedSrc,
            alt,
          });
        }
        return;
      }

      // Mathematical formulas / equations
      if (
        tagName === 'math' ||
        $(el).hasClass('katex') ||
        $(el).hasClass('math') ||
        $(el).attr('data-math')
      ) {
        const formula = $(el).attr('data-math') || $(el).text().trim();
        if (formula) {
          currentSection.blocks.push({
            type: 'equation',
            content: formula,
          });
        }
        return;
      }

      // If generic container (div, section, article, etc.), process its children
      $(el).children().each((_, child) => {
        processElement(child);
      });
    }
  }

  rootElements.each((_, el) => {
    processElement(el);
  });

  commitCurrentSection();

  // If no sections were created, create one default section from text
  if (sections.length === 0) {
    const rawText = $.text().trim();
    if (rawText) {
      sections.push({
        heading: undefined,
        blocks: [
          {
            type: 'paragraph',
            content: rawText,
          },
        ],
      });
    }
  }

  // Calculate approximate total word count
  let totalWords = 0;
  for (const sec of sections) {
    if (sec.heading) {
      totalWords += sec.heading.split(/\s+/).length;
    }
    for (const b of sec.blocks) {
      if (b.content) {
        totalWords += b.content.split(/\s+/).length;
      }
    }
  }

  return {
    title,
    description,
    authors,
    source: {
      type: 'url',
      url: sourceUrl,
      extractedAt: new Date().toISOString(),
    },
    sections,
    wordCount: totalWords,
    language: dom.window.document.documentElement.lang || 'en',
    sourceReferences: sourceReferences.length > 0 ? sourceReferences : undefined,
  };
}
