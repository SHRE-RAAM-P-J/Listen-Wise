import { StructuredContent, ensureContentIdentifiers } from '../../models/structured-content.js';
import {
  LessonChapter,
  LessonValidation,
  DocumentUnderstanding,
  UnsupportedClaimItem,
} from '../../models/lesson.js';
import { AppError } from '../../middleware/error-handler.js';

const STOP_WORDS = new Set(
  'about after again against all also among an and any are around as at be because been before being between both but by can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just more most my myself no nor not of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who why with would you your yours yourself yourselves a it the'.split(' '),
);

function meaningfulTokens(value: string): Set<string> {
  return new Set(
    (value.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || []).filter(
      (token) => !STOP_WORDS.has(token),
    ),
  );
}

function sectionBody(section: StructuredContent['sections'][number]): string {
  return section.blocks
    .map((block) => {
      if ((block.type === 'ordered-list' || block.type === 'unordered-list') && block.items?.length) {
        return block.items.join(' ');
      }
      if (block.type === 'table' && block.tableData?.length) {
        return block.tableData.flatMap((row) => row).join(' ');
      }
      return block.content || '';
    })
    .join(' ')
    .trim();
}

export class LessonValidatorService {
  public static assertPassed(
    validation: LessonValidation | undefined,
    documentTitle = 'this source',
    sourceUrl?: string,
  ): void {
    const valid =
      validation?.sourceCoverage === 'passed' &&
      Number.isFinite(validation.coverageScore) &&
      validation.coverageScore >= 0.7 &&
      Array.isArray(validation.unsupportedClaims) &&
      validation.unsupportedClaims.length === 0;
    if (valid) return;

    const percent = Number.isFinite(validation?.coverageScore)
      ? Math.round((validation?.coverageScore || 0) * 100)
      : 0;
    const sourceContext = sourceUrl ? ` (${sourceUrl})` : '';
    throw new AppError(
      `We couldn't verify that the lesson is grounded in "${documentTitle}"${sourceContext} (${percent}% source coverage). No audio was generated. Try a more complete source or paste the relevant text.`,
      422,
      'SOURCE_VALIDATION_FAILED',
    );
  }

  /**
   * Performs rigorous source coverage and factual alignment validation.
   */
  public static validateLesson(
    document: StructuredContent,
    understanding: DocumentUnderstanding,
    chapters: LessonChapter[],
  ): LessonValidation {
    const warnings: string[] = [];
    const unsupportedClaims: UnsupportedClaimItem[] = [];

    // 1. Normalize IDs and gather source text by section.
    const identifiedDocument = ensureContentIdentifiers(document);
    const validBlockIds = new Set<string>();
    const allSourceTextParts: string[] = [];
    const sourceNumbers = new Set<string>();

    const sourceSections = identifiedDocument.sections
      .map((sec, index) => {
        const body = sectionBody(sec);
        const blockIds = new Set(sec.blocks.map((block) => block.id).filter((id): id is string => Boolean(id)));
        return {
          title: sec.heading?.trim() || `Section ${index + 1}`,
          body,
          blockIds,
          tokens: meaningfulTokens(body),
        };
      })
      .filter((section) => section.body.length > 0);

    for (const sec of identifiedDocument.sections) {
      for (const blk of sec.blocks) {
        if (blk.id) validBlockIds.add(blk.id);
        if (blk.content) {
          allSourceTextParts.push(blk.content);
          // Find numbers (integers, decimals, percentages)
          const matches = blk.content.match(/\b\d[\d,]*(?:\.\d+)?%?/g);
          if (matches) {
            for (const m of matches) sourceNumbers.add(m);
          }
        }
        if (blk.items) {
          allSourceTextParts.push(blk.items.join(' '));
        }
        if (blk.tableData) {
          for (const row of blk.tableData) {
            allSourceTextParts.push(row.join(' '));
          }
        }
      }
    }

    const fullSourceText = allSourceTextParts.join(' ').toLowerCase();
    const fullLessonScript = chapters.map((c) => c.teachingScript).join(' ');

    // 2. Validate source coverage using real block IDs and lexical evidence from each section.
    const coveredSectionTitles: string[] = [];
    const missingSectionTitles: string[] = [];

    for (const section of sourceSections) {
      const minimumEvidenceTerms = Math.min(2, section.tokens.size);
      const groundedInChapter = minimumEvidenceTerms > 0 && chapters.some((chapter) => {
        const hasValidBlockReference = (chapter.sourceReferences || []).some(
          (reference) => reference.blockId && section.blockIds.has(reference.blockId),
        );
        if (!hasValidBlockReference) return false;
        const chapterText = [chapter.title, chapter.overview, ...chapter.conceptsCovered, chapter.teachingScript].join(' ');
        const chapterTokens = meaningfulTokens(chapterText);
        const overlapCount = [...section.tokens].filter((token) => chapterTokens.has(token)).length;
        return overlapCount >= minimumEvidenceTerms;
      });

      if (groundedInChapter) {
        coveredSectionTitles.push(section.title);
      } else {
        missingSectionTitles.push(section.title);
      }
    }

    const totalSectionsCount = sourceSections.length;
    const coverageScore = totalSectionsCount > 0 ? coveredSectionTitles.length / totalSectionsCount : 0;

    if (coverageScore < 0.6 && missingSectionTitles.length > 0) {
      warnings.push(
        `Limited source section coverage (${Math.round(coverageScore * 100)}%). Sections not directly represented: ${missingSectionTitles.slice(0, 3).join(', ')}.`,
      );
    }

    // 3. Verify Key Concepts are Covered
    if (understanding.keyConcepts && understanding.keyConcepts.length > 0) {
      for (const kc of understanding.keyConcepts) {
        const kcNameLower = kc.name.toLowerCase();
        const found = chapters.some(
          (ch) =>
            ch.conceptsCovered.some((c) => c.toLowerCase().includes(kcNameLower)) ||
            ch.teachingScript.toLowerCase().includes(kcNameLower),
        );
        if (!found) {
          warnings.push(`Key concept "${kc.name}" was identified in understanding but not fully detailed in chapters.`);
        }
      }
    }

    // 4. Verify chapter source references point to actual source blocks.
    for (const chapter of chapters) {
      if (!chapter.sourceReferences || chapter.sourceReferences.length === 0) {
        warnings.push(`Chapter "${chapter.title}" has no explicit source block references.`);
        continue;
      }

      for (const ref of chapter.sourceReferences) {
        if (ref.blockId && !validBlockIds.has(ref.blockId)) {
          const message = `Chapter "${chapter.title}" references source block ID "${ref.blockId}" which does not exist in the source document.`;
          warnings.push(message);
          unsupportedClaims.push({
            claim: `Invalid source reference "${ref.blockId}" in chapter "${chapter.title}"`,
            chapterId: chapter.id,
            reason: message,
            severity: 'discrepancy',
          });
        }
      }
    }

    // 5. Unsupported numeric claims are not grounded just because the section title matched.
    for (const chapter of chapters) {
      const scriptNumbers = chapter.teachingScript.match(/\b\d[\d,]*(?:\.\d+)?%?/g);
      if (scriptNumbers) {
        for (const num of scriptNumbers) {
          const normalized = num.replace(/[,%]/g, '');
          const numberIsGrounded = num.endsWith('%')
            ? fullSourceText.includes(num.toLowerCase())
            : sourceNumbers.has(num) || sourceNumbers.has(normalized) || fullSourceText.includes(num.toLowerCase());
          if (!numberIsGrounded) {
            unsupportedClaims.push({
              claim: `Numeric claim "${num}" used in chapter "${chapter.title}"`,
              chapterId: chapter.id,
              reason: `The number "${num}" was not found in the extracted source material.`,
              severity: 'discrepancy',
            });
          }
        }
      }

      // Check for generic filler phrases that contradict teacher persona
      const fillerPhrases = [
        'in this modern world',
        'since the dawn of time',
        'studies show that',
        'scientists have proven',
      ];
      for (const phrase of fillerPhrases) {
        if (
          chapter.teachingScript.toLowerCase().includes(phrase) &&
          !fullSourceText.includes(phrase)
        ) {
          warnings.push(
            `Chapter "${chapter.title}" uses generic rhetorical filler ("${phrase}") not present in the source.`,
          );
        }
      }
    }

    // 6. Complete Lesson Script Completeness
    const completeScriptMissingChapters = chapters.filter(
      (ch) => !fullLessonScript.includes(ch.title) && !fullLessonScript.includes(ch.teachingScript.slice(0, 30)),
    );
    if (completeScriptMissingChapters.length > 0) {
      warnings.push('The compiled lesson script omitted content from one or more generated chapters.');
    }

    // Determine final status
    const sourceCoverage =
      coverageScore >= 0.7 && unsupportedClaims.length === 0
        ? 'passed'
        : coverageScore >= 0.4
        ? 'partial'
        : 'failed';

    return {
      sourceCoverage,
      coverageScore: Number(coverageScore.toFixed(2)),
      unsupportedClaims,
      warnings,
      coveredSectionTitles,
      missingSectionTitles,
    };
  }
}
