import { StructuredContent } from '../../models/structured-content.js';
import {
  LessonChapter,
  LessonValidation,
  DocumentUnderstanding,
  UnsupportedClaimItem,
} from '../../models/lesson.js';

export class LessonValidatorService {
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

    // 1. Gather all valid block IDs and source text
    const validBlockIds = new Set<string>();
    const allSourceTextParts: string[] = [];
    const sourceNumbers = new Set<string>();
    const sourceSectionTitles = new Set<string>();

    for (const sec of document.sections) {
      if (sec.heading && sec.heading.trim()) {
        sourceSectionTitles.add(sec.heading.trim());
      }
      for (const blk of sec.blocks) {
        if (blk.id) validBlockIds.add(blk.id);
        if (blk.content) {
          allSourceTextParts.push(blk.content);
          // Find numbers (integers, decimals, percentages)
          const matches = blk.content.match(/\b\d+(?:\.\d+)?%?\b/g);
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

    // 2. Validate Source Coverage of Sections
    const coveredSectionTitles: string[] = [];
    const missingSectionTitles: string[] = [];

    for (const secTitle of sourceSectionTitles) {
      const lowerTitle = secTitle.toLowerCase();
      // Check if title or key tokens appear in chapter titles or concepts or script
      const titleTokens = lowerTitle.split(/\s+/).filter((t) => t.length > 3);
      const isReferencedInChapters = chapters.some((ch) => {
        if (ch.title.toLowerCase().includes(lowerTitle)) return true;
        if (ch.overview.toLowerCase().includes(lowerTitle)) return true;
        if (ch.conceptsCovered.some((c) => c.toLowerCase().includes(lowerTitle))) return true;
        if (ch.sourceReferences.some((r) => r.sectionTitle?.toLowerCase() === lowerTitle)) return true;
        // Token match
        if (titleTokens.length > 0 && titleTokens.every((tok) => ch.teachingScript.toLowerCase().includes(tok))) return true;
        return false;
      });

      if (isReferencedInChapters) {
        coveredSectionTitles.push(secTitle);
      } else {
        missingSectionTitles.push(secTitle);
      }
    }

    const totalSectionsCount = sourceSectionTitles.size > 0 ? sourceSectionTitles.size : 1;
    const coverageScore = coveredSectionTitles.length / totalSectionsCount;

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

    // 4. Verify Chapter Source References point to actual blocks
    for (const chapter of chapters) {
      if (!chapter.sourceReferences || chapter.sourceReferences.length === 0) {
        warnings.push(`Chapter "${chapter.title}" has no explicit source block references.`);
        continue;
      }

      for (const ref of chapter.sourceReferences) {
        if (ref.blockId && !validBlockIds.has(ref.blockId)) {
          warnings.push(
            `Chapter "${chapter.title}" references source block ID "${ref.blockId}" which does not exist in the source document.`,
          );
        }
      }
    }

    // 5. Unsupported-Claim / Metric Verification
    // Check for specific numbers/percentages introduced in the script that were never in the source
    for (const chapter of chapters) {
      const scriptNumbers = chapter.teachingScript.match(/\b\d+(?:\.\d+)?%/g); // Check percentages without trailing \b since % is non-word
      if (scriptNumbers) {
        for (const num of scriptNumbers) {
          if (!sourceNumbers.has(num) && !fullSourceText.includes(num.toLowerCase())) {
            unsupportedClaims.push({
              claim: `Percentage metric "${num}" used in chapter "${chapter.title}"`,
              chapterId: chapter.id,
              reason: `The percentage "${num}" was not found in the extracted source material.`,
              severity: 'warning',
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
