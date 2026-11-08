import { StructuredContent, ensureContentIdentifiers } from '../../models/structured-content.js';
import {
  GeneratedLesson,
  GeneratedLessonSchema,
  DocumentUnderstanding,
  DocumentUnderstandingSchema,
  LessonChapter,
  LessonChapterSchema,
} from '../../models/lesson.js';
import { LLMProvider } from './providers/llm-provider.interface.js';
import { LLMFactory } from './llm.factory.js';
import { ChunkingService } from './chunking.service.js';
import { PromptBuilderService } from './prompt-builder.service.js';
import { LessonValidatorService } from './lesson-validator.service.js';
import { SourceQualityService } from '../extraction/source-quality.service.js';
import { AppError } from '../../middleware/error-handler.js';

export interface GenerateLessonOptions {
  provider?: LLMProvider;
}

export class LessonGeneratorService {
  /**
   * Generates a complete, structured pedagogical lesson from canonical structured content.
   */
  public static async generateLesson(
    rawDocument: StructuredContent,
    options?: GenerateLessonOptions,
  ): Promise<GeneratedLesson> {
    // 1. Assign deterministic IDs to blocks & sections if not already present
    const document = ensureContentIdentifiers(rawDocument);
    SourceQualityService.assertUsable(document);

    // 2. Select LLM Provider
    const provider = options?.provider || LLMFactory.getProvider();

    if (!provider.isConfigured()) {
      throw new AppError(
        'The AI Understanding Engine is not configured. Please set GEMINI_API_KEY in server/.env.',
        503,
        'AI_PROVIDER_NOT_CONFIGURED',
      );
    }

    const teacherSystemInstruction = PromptBuilderService.getTeacherSystemInstruction();

    // 3. Stage 1: Document Understanding & Conceptual Architectural Map
    console.log(`[LessonGenerator] Analyzing document architecture for: "${document.title}"...`);
    const understandingPrompt = PromptBuilderService.buildDocumentUnderstandingPrompt(document);

    const understandingRaw = await provider.generateStructuredJSON<any>(
      understandingPrompt,
      'JSON matching DocumentUnderstandingSchema',
      {
        systemInstruction: teacherSystemInstruction,
        temperature: 0.1,
      },
    );

    let understanding: DocumentUnderstanding;
    try {
      understanding = DocumentUnderstandingSchema.parse(understandingRaw);
    } catch (valErr: any) {
      console.warn('[LessonGenerator] Document understanding schema parse warning, attempting fallback repair:', valErr.message);
      // Construct fallback with available fields
      understanding = {
        subject: understandingRaw?.subject || document.title,
        purpose: understandingRaw?.purpose || 'Explain technical concepts grounded in the source material',
        learningObjective: understandingRaw?.learningObjective || `Master the fundamentals of ${document.title}`,
        mainTopics: Array.isArray(understandingRaw?.mainTopics) && understandingRaw.mainTopics.length > 0
          ? understandingRaw.mainTopics
          : [document.title],
        keyConcepts: Array.isArray(understandingRaw?.keyConcepts) ? understandingRaw.keyConcepts : [],
        terminology: Array.isArray(understandingRaw?.terminology) ? understandingRaw.terminology : [],
        relationshipsBetweenConcepts: Array.isArray(understandingRaw?.relationshipsBetweenConcepts) ? understandingRaw.relationshipsBetweenConcepts : [],
        relationshipsBetweenSections: Array.isArray(understandingRaw?.relationshipsBetweenSections) ? understandingRaw.relationshipsBetweenSections : [],
        importantExamples: Array.isArray(understandingRaw?.importantExamples) ? understandingRaw.importantExamples : [],
        importantFormulasOrNumbers: Array.isArray(understandingRaw?.importantFormulasOrNumbers) ? understandingRaw.importantFormulasOrNumbers : [],
        prerequisites: Array.isArray(understandingRaw?.prerequisites) ? understandingRaw.prerequisites : [],
      };
    }

    // 4. Stage 2: Chunk Document for Manageable Section-by-Section Explanations
    const chunks = ChunkingService.createChunks(document);
    console.log(`[LessonGenerator] Split into ${chunks.length} manageable pedagogical chunks.`);

    // 5. Stage 3: Section-by-Section Chapter Generation
    const chapters: LessonChapter[] = [];
    let previousChapterTitle: string | undefined;
    let previousTransition: string | undefined;

    for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
      const chunk = chunks[cIdx];
      console.log(`[LessonGenerator] Generating Chapter ${cIdx + 1}/${chunks.length} ("${chunk.suggestedTitle}")...`);

      const chapterPrompt = PromptBuilderService.buildChapterGenerationPrompt(
        chunk,
        understanding,
        previousChapterTitle,
        previousTransition,
      );

      const chapterRaw = await provider.generateStructuredJSON<any>(
        chapterPrompt,
        'JSON matching LessonChapterSchema',
        {
          systemInstruction: teacherSystemInstruction,
          temperature: 0.2, // slightly higher for natural educational flow while keeping facts grounded
        },
      );

      let chapter: LessonChapter;
      try {
        chapter = LessonChapterSchema.parse({
          ...chapterRaw,
          index: cIdx + 1,
          id: chapterRaw?.id || `chapter-${cIdx + 1}`,
        });
      } catch (chValErr: any) {
        console.warn(`[LessonGenerator] Chapter ${cIdx + 1} schema validation failed, applying repair:`, chValErr.message);
        // Fallback repair
        chapter = {
          id: `chapter-${cIdx + 1}`,
          index: cIdx + 1,
          title: chapterRaw?.title || chunk.suggestedTitle,
          overview: chapterRaw?.overview || `Detailed exploration of ${chunk.suggestedTitle}`,
          conceptsCovered: Array.isArray(chapterRaw?.conceptsCovered) ? chapterRaw.conceptsCovered : chunk.sectionTitles,
          teachingScript: typeof chapterRaw?.teachingScript === 'string' && chapterRaw.teachingScript.length > 20
            ? chapterRaw.teachingScript
            : `In this chapter, we explore ${chunk.suggestedTitle}. ${chunk.sections.map((s) => s.blocks.map((b) => b.content).join(' ')).join(' ').slice(0, 400)}`,
          transitionToNext: chapterRaw?.transitionToNext || '',
          sourceReferences: Array.isArray(chapterRaw?.sourceReferences) && chapterRaw.sourceReferences.length > 0
            ? chapterRaw.sourceReferences
            : chunk.blockIds.map((bId) => ({ blockId: bId, pageNumber: null, sectionTitle: chunk.suggestedTitle })),
        };
      }

      chapters.push(chapter);
      previousChapterTitle = chapter.title;
      previousTransition = chapter.transitionToNext;
    }

    if (chapters.length === 0) {
      throw new AppError('The AI Engine could not produce any teaching chapters for this document.', 500, 'CHAPTER_GENERATION_FAILED');
    }

    // 6. Stage 4: Compile Complete Pedagogical Lesson Script
    const lessonScriptSections: string[] = [];
    lessonScriptSections.push(`# ${document.title}\n`);
    lessonScriptSections.push(`Welcome to ListenWise. In this lesson, we will explore ${understanding.subject.toLowerCase()}.\n`);

    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i];
      lessonScriptSections.push(`## ${ch.title}\n`);
      lessonScriptSections.push(`${ch.teachingScript}\n`);
      if (ch.transitionToNext && i < chapters.length - 1) {
        lessonScriptSections.push(`${ch.transitionToNext}\n`);
      }
    }

    lessonScriptSections.push('This concludes our lesson. You now have a clear, foundational understanding of the core concepts.');
    const completeLessonScript = lessonScriptSections.join('\n');

    // 7. Stage 5: Rigorous Source Coverage and Unsupported-Claim Validation
    console.log('[LessonGenerator] Running source coverage and claim validation...');
    const validation = LessonValidatorService.validateLesson(document, understanding, chapters);
    LessonValidatorService.assertPassed(
      validation,
      document.title,
      document.source.type === 'url' ? document.source.url : undefined,
    );

    // 8. Construct & Validate Final Generated Lesson
    const lessonOverview = `A ${chapters.length}-chapter audio lesson covering ${understanding.mainTopics.slice(0, 3).join(', ')}. Objective: ${understanding.learningObjective}`;

    const finalLesson: GeneratedLesson = {
      id: `lesson-${Date.now()}`,
      documentTitle: document.title,
      subject: understanding.subject,
      purpose: understanding.purpose,
      lessonOverview,
      keyConcepts: understanding.keyConcepts,
      chapters,
      completeLessonScript,
      validation,
      createdAt: new Date().toISOString(),
    };

    return GeneratedLessonSchema.parse(finalLesson);
  }
}
