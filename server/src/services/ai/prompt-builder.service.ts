import { StructuredContent, ContentSection, ContentBlock } from '../../models/structured-content.js';
import { DocumentUnderstanding } from '../../models/lesson.js';
import { DocumentChunk } from './chunking.service.js';

export class PromptBuilderService {
  /**
   * System instruction establishing the persona: expert educational instructor.
   */
  public static getTeacherSystemInstruction(): string {
    return `You are ListenWise's Master Pedagogical Instructor.
Your purpose is to transform source technical materials, articles, and research documents into clear, engaging, natural teaching lessons.

CORE PEDAGOGICAL PRINCIPLES:
1. You are NOT a generic summariser or shallow bullet-point generator. You are a knowledgeable teacher explaining a technical subject to an eager student.
2. Teach intuitively: Explain WHAT each concept means, WHY it matters, and HOW it operates step-by-step.
3. Strict Factual Grounding: The provided source is your absolute factual boundary. Never invent facts, speculative numbers, or unsupported claims. If the source does not clarify something, state that limitation cleanly.
4. Spoken Audio Readiness: Write in clear, natural spoken-language sentences with natural rhythm and flow. Avoid robotic phrases like "As stated in paragraph 2" or repetitive transitions like "Now let us move to the next section".
5. Technical Fidelity: Preserve exact formulas, significant numerical values, key algorithms, terminology, and concrete examples.
6. Meaningful Titles: Chapter titles must be descriptive and topic-specific (e.g. "Qubit Superposition & Entanglement", NOT "Introduction" or "Chapter 1").`;
  }

  /**
   * Builds the prompt for Document Understanding analysis.
   */
  public static buildDocumentUnderstandingPrompt(document: StructuredContent): string {
    const documentOutline = this.formatDocumentOutline(document);

    return `Carefully analyse the following document structure and extracted content to build an architectural understanding.

DOCUMENT TITLE: "${document.title}"
SOURCE TYPE: ${document.source.type} ${document.source.url ? `(${document.source.url})` : ''}
WORD COUNT: ~${document.wordCount} words

DOCUMENT OUTLINE & CORE EXTRACTED CONTENT:
${documentOutline}

TASK:
Analyse the document and extract its pedagogical foundations.
Ground all observations strictly in the provided text.

REQUIRED JSON SCHEMA SPECIFICATION:
{
  "subject": "Clear, concise technical subject of the document",
  "purpose": "Primary objective or purpose of this material",
  "learningObjective": "What the learner should understand after completing this lesson",
  "mainTopics": ["List of 3-6 core topics covered across the sections"],
  "keyConcepts": [
    {
      "name": "Concept name",
      "explanation": "Clear, intuitive, 2-3 sentence explanation grounded in the source",
      "sourceReferences": ["Name of section or concept origin"]
    }
  ],
  "terminology": [
    {
      "term": "Technical term",
      "definition": "Definition as supported by the source"
    }
  ],
  "relationshipsBetweenConcepts": ["How concept A relates to concept B based on the text"],
  "relationshipsBetweenSections": ["How earlier sections build the foundation for later sections"],
  "importantExamples": ["Key examples or case studies included in the source"],
  "importantFormulasOrNumbers": ["Explicit numerical values, metrics, formulas, or constants mentioned"],
  "prerequisites": ["Any explicit foundational knowledge required, or empty array if none specified"]
}`;
  }

  /**
   * Builds the prompt for generating a single teaching chapter from a chunk of sections.
   */
  public static buildChapterGenerationPrompt(
    chunk: DocumentChunk,
    understanding: DocumentUnderstanding,
    previousChapterTitle?: string,
    previousTransition?: string,
  ): string {
    const formattedChunkContent = this.formatChunkContent(chunk);

    return `Create a complete, engaging teaching chapter for Chunk ${chunk.chunkIndex} of ${chunk.totalChunks}.

OVERALL LESSON CONTEXT:
- Document Subject: "${understanding.subject}"
- Purpose: "${understanding.purpose}"
- Learning Objective: "${understanding.learningObjective}"
${previousChapterTitle ? `- Previous Chapter: "${previousChapterTitle}"` : '- Position: Initial opening chapter of the lesson'}
${previousTransition ? `- Transition Hook from previous chapter: "${previousTransition}"` : ''}

CHUNK SECTIONS TO TEACH:
${formattedChunkContent}

CHAPTER GENERATION REQUIREMENTS:
1. Title: Give this chapter a distinctive, descriptive, non-generic title representing its core concept (NEVER use "Chapter ${chunk.chunkIndex}", "Introduction", or "Conclusion").
2. Overview: Provide a 1-2 sentence overview framing what will be explored.
3. Teaching Script:
   - Deliver a thorough, articulate teaching explanation (typically 200–500 words for spoken audio).
   - Begin smoothly (if following a previous chapter, naturally bridge from the previous topic).
   - Walk through the concepts step-by-step with clear intuitive analogies where helpful.
   - For technical formulas or values, explain their role and preserve the exact expression.
   - For tables or comparisons, explain the key takeaways across the rows/columns.
   - For code blocks, explain the programmatic flow and purpose.
   - For diagrams/images, explain their significance using the provided caption.
4. Transition: Write a natural 1-2 sentence forward-looking transition bridging to subsequent topics (or a concluding reinforcement if this is the final chapter).
5. Source References: Attribute each concept or major claim to its source blockId and sectionTitle.

REQUIRED JSON SCHEMA SPECIFICATION:
{
  "id": "chapter-${chunk.chunkIndex}",
  "title": "Topic-Specific Descriptive Title",
  "overview": "Concise overview of this chapter",
  "conceptsCovered": ["Concept 1", "Concept 2"],
  "teachingScript": "Full spoken teaching explanation with natural pedagogical pacing...",
  "transitionToNext": "Natural bridge sentence leading into the next chapter...",
  "sourceReferences": [
    {
      "blockId": "sec-X-bY",
      "pageNumber": 1,
      "sectionTitle": "Section Heading"
    }
  ]
}`;
  }

  /**
   * Helper to format document sections and blocks into an informative outline.
   */
  private static formatDocumentOutline(document: StructuredContent): string {
    const lines: string[] = [];

    for (let sIdx = 0; sIdx < document.sections.length; sIdx++) {
      const sec = document.sections[sIdx];
      const heading = sec.heading ? `Section: ${sec.heading}` : `Section ${sIdx + 1}`;
      lines.push(`\n[${sec.id || `sec-${sIdx + 1}`}] ${heading}`);

      for (const block of sec.blocks) {
        const idTag = block.id ? `[${block.id}] ` : '';
        if (block.type === 'heading') {
          lines.push(`  ${idTag}Heading (${block.level || 2}): ${block.content}`);
        } else if (block.type === 'paragraph') {
          // Provide sample text
          const preview = block.content.length > 250 ? `${block.content.slice(0, 250)}...` : block.content;
          lines.push(`  ${idTag}Paragraph: ${preview}`);
        } else if (block.type === 'table') {
          lines.push(`  ${idTag}Table: ${block.content.split('\n')[0]} (${block.tableData?.length || 0} rows)`);
        } else if (block.type === 'equation') {
          lines.push(`  ${idTag}Formula: ${block.content}`);
        } else if (block.type === 'code') {
          lines.push(`  ${idTag}Code (${block.language || 'generic'}): ${block.content.split('\n')[0]}...`);
        } else if (block.type === 'image') {
          lines.push(`  ${idTag}Image: ${block.content} ${block.note ? `(${block.note})` : ''}`);
        } else if (block.type === 'unordered-list' || block.type === 'ordered-list') {
          lines.push(`  ${idTag}List (${block.items?.length || 0} items): ${block.items?.slice(0, 2).join('; ')}...`);
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Helper to format a chunk's sections and blocks in full detail for chapter generation.
   */
  private static formatChunkContent(chunk: DocumentChunk): string {
    const lines: string[] = [];

    for (const section of chunk.sections) {
      lines.push(`\n### ${section.heading || 'Section'} (ID: ${section.id || 'sec'})`);

      for (const block of section.blocks) {
        const bId = block.id || 'blk';
        const pageTag = block.pageNumber ? ` [Page ${block.pageNumber}]` : '';

        switch (block.type) {
          case 'paragraph':
            lines.push(`Block [${bId}]${pageTag} (Paragraph):\n${block.content}\n`);
            break;
          case 'table':
            lines.push(`Block [${bId}]${pageTag} (Table):\n${block.content}\n`);
            break;
          case 'equation':
            lines.push(`Block [${bId}]${pageTag} (Mathematical Formula):\n$$ ${block.content} $$\n`);
            break;
          case 'code':
            lines.push(`Block [${bId}]${pageTag} (Code - ${block.language || 'text'}):\n\`\`\`${block.language || ''}\n${block.content}\n\`\`\`\n`);
            break;
          case 'image':
            lines.push(`Block [${bId}]${pageTag} (Image / Diagram Reference):\n${block.content} ${block.note ? `(${block.note})` : ''}\n`);
            break;
          case 'ordered-list':
          case 'unordered-list':
            lines.push(`Block [${bId}]${pageTag} (List):\n${block.items ? block.items.map((it, idx) => `  ${idx + 1}. ${it}`).join('\n') : block.content}\n`);
            break;
          case 'quote':
            lines.push(`Block [${bId}]${pageTag} (Quote):\n> ${block.content}\n`);
            break;
          default:
            if (block.content) {
              lines.push(`Block [${bId}]${pageTag}:\n${block.content}\n`);
            }
        }
      }
    }

    return lines.join('\n');
  }
}
