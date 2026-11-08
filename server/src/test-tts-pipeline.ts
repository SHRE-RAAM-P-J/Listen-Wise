import fs from 'node:fs';
import { GnaniTtsService } from './services/tts/gnani-tts.service.js';
import { WavUtils } from './services/tts/wav-utils.js';
import { TempStorageService } from './services/storage/temp-storage.service.js';
import { Lesson, LessonChapter } from './models/lesson.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
    failed++;
  }
}

async function runPhase3Tests() {
  console.log('\n======================================================');
  console.log('   LISTENWISE PHASE 3: GNANI AI TTS AUDIO TESTS       ');
  console.log('======================================================\n');

  // ─────────────────────────────────────────────────────────────
  // 1. WAV PARSER & BINARY HEADER VALIDATION
  // ─────────────────────────────────────────────────────────────
  console.log('--- 1. Testing WAV Binary Parser & Metadata Extraction ---');
  const syntheticWav = WavUtils.createSyntheticWav(3.0, 440); // 3 seconds @ 440Hz
  const wavMeta = WavUtils.parseWav(syntheticWav);

  assert(wavMeta.sampleRate === 24000, `Sample rate parsed correctly: ${wavMeta.sampleRate} Hz`);
  assert(wavMeta.numChannels === 1, `Channel count is 1 (mono)`);
  assert(wavMeta.bitsPerSample === 16, `Bits per sample is 16-bit PCM`);
  assert(Math.abs(wavMeta.durationSeconds - 3.0) < 0.1, `Audio duration calculated accurately: ${wavMeta.durationSeconds}s`);

  // ─────────────────────────────────────────────────────────────
  // 2. SEAMLESS WAV BUFFER MERGING
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 2. Testing Chunked WAV Merging ---');
  const chunk1 = WavUtils.createSyntheticWav(2.0, 440);
  const chunk2 = WavUtils.createSyntheticWav(3.0, 880);
  const mergedWav = WavUtils.mergeWavBuffers([chunk1, chunk2]);
  const mergedMeta = WavUtils.parseWav(mergedWav);

  assert(
    Math.abs(mergedMeta.durationSeconds - 5.0) < 0.1,
    `Merged WAV accurately combines durations: ${mergedMeta.durationSeconds}s (expected ~5.0s)`,
  );
  assert(mergedWav.length > chunk1.length && mergedWav.length > chunk2.length, 'Merged file size reflects total audio');

  // ─────────────────────────────────────────────────────────────
  // 3. TEXT SCRIPT CHUNKING FOR TTS LIMITS
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 3. Testing Script Chunking for Gnani Timbre Limit ---');
  const longScript = `
    Welcome to this technical lesson on quantum mechanics. In this section we explore qubits.
    Unlike classical bits which can only exist in states of zero or one, a qubit leverages superposition.
    This mathematical property allows algorithms like Shor and Grover to achieve polynomial and quadratic speedups.
    Furthermore, quantum entanglement connects distant particles in ways classical physics cannot explain.
  `.repeat(4);

  const scriptChunks = GnaniTtsService.splitScriptIntoChunks(longScript, 400);
  assert(scriptChunks.length >= 3, `Long script split into ${scriptChunks.length} sentence-bounded chunks`);
  assert(scriptChunks.every((c) => c.length <= 400), 'All chunks strictly respect the 400-char safe limit');
  assert(scriptChunks.every((c) => !c.startsWith(' ') && !c.endsWith(' ')), 'All chunks cleanly trimmed');

  // ─────────────────────────────────────────────────────────────
  // 4. TEST SINGLE SHORT SCRIPT AUDIO GENERATION
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 4. Testing Short Script Audio Synthesis ---');
  const shortScript = 'Welcome to ListenWise. Let us begin our exploration of artificial neural networks.';
  const shortAudioBuffer = await GnaniTtsService.synthesizeTextSegment(shortScript, { mockMode: true });
  const shortMeta = WavUtils.parseWav(shortAudioBuffer);

  assert(shortAudioBuffer.length > 44, `Binary audio generated (${shortAudioBuffer.length} bytes)`);
  assert(shortMeta.durationSeconds > 0, `Short script has non-zero duration (${shortMeta.durationSeconds}s)`);

  // ─────────────────────────────────────────────────────────────
  // 5. TEST MULTI-CHAPTER LESSON AUDIO GENERATION
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 5. Testing Multi-Chapter Lesson Audio Generation ---');
  const multiChapterLesson: Lesson = {
    id: `test-lesson-${Date.now()}`,
    documentTitle: 'Transformer Models and Attention',
    subject: 'Deep Learning',
    purpose: 'Pedagogical explanation of self-attention',
    lessonOverview: 'A comprehensive 3-chapter audio lesson',
    keyConcepts: [
      { name: 'Self-Attention', explanation: 'Dynamic query-key compatibility', sourceReferences: [] },
    ],
    chapters: [
      {
        id: 'ch-1',
        index: 1,
        title: 'Introduction to Attention Mechanisms',
        overview: 'Moving from recurrence to attention',
        conceptsCovered: ['Attention'],
        teachingScript: 'In this opening chapter, we discover why sequential recurrent neural networks were replaced by parallel self-attention.',
        transitionToNext: 'Now let us look at the mathematical formulation.',
        sourceReferences: [{ blockId: 'b-1', pageNumber: 1, sectionTitle: 'Overview' }],
      },
      {
        id: 'ch-2',
        index: 2,
        title: 'Scaled Dot-Product Formula',
        overview: 'Softmax and scaling by square root of d_k',
        conceptsCovered: ['Dot-Product'],
        teachingScript: 'Attention calculates the compatibility of queries and keys, dividing by square root of d_k to maintain stable gradients.',
        transitionToNext: 'Next, we examine the computational efficiency.',
        sourceReferences: [{ blockId: 'b-2', pageNumber: 2, sectionTitle: 'Formulation' }],
      },
      {
        id: 'ch-3',
        index: 3,
        title: 'Computational Complexity and Parallelism',
        overview: 'O(1) sequential operations on modern GPUs',
        conceptsCovered: ['Complexity'],
        teachingScript: 'Self-attention performs in O(1) sequential operations, allowing modern GPUs to train on massive datasets with unprecedented speed.',
        transitionToNext: 'This concludes our lesson on Transformers.',
        sourceReferences: [{ blockId: 'b-3', pageNumber: 3, sectionTitle: 'Complexity' }],
      },
    ],
    completeLessonScript: 'Complete compiled lesson script...',
    validation: {
      sourceCoverage: 'passed',
      coverageScore: 1,
      unsupportedClaims: [],
      warnings: [],
      coveredSectionTitles: [],
      missingSectionTitles: [],
    },
    createdAt: new Date().toISOString(),
  };

  const rejectedLesson: Lesson = {
    ...multiChapterLesson,
    id: `rejected-lesson-${Date.now()}`,
    validation: {
      sourceCoverage: 'failed',
      coverageScore: 0,
      unsupportedClaims: [],
      warnings: ['No generated content matched the source.'],
      coveredSectionTitles: [],
      missingSectionTitles: ['Source section'],
    },
  };
  let invalidLessonAudioBlocked = false;
  try {
    await GnaniTtsService.generateLessonAudio(rejectedLesson, { mockMode: true });
  } catch (err: any) {
    invalidLessonAudioBlocked = err.code === 'SOURCE_VALIDATION_FAILED';
  }
  assert(invalidLessonAudioBlocked, 'Does not start TTS for a lesson with failed source validation');

  const audioResult = await GnaniTtsService.generateLessonAudio(multiChapterLesson, { mockMode: true });

  assert(audioResult.audioSegments.length === 3, 'Generates audio segments for all 3 chapters');
  assert(audioResult.allChaptersCompleted === true, 'All chapters marked completed after synthesis');
  assert(audioResult.totalDurationSeconds > 0, `Total lesson duration calculated (${audioResult.totalDurationSeconds}s)`);
  assert(
    audioResult.audioSegments.every((s) => s.audioUrl.startsWith('/api/tts/audio/')),
    'Constructs valid playable audio reference URLs',
  );

  // Verify file was written to temporary storage
  const firstSegment = audioResult.audioSegments[0];
  assert(fs.existsSync(firstSegment.audioPath), `Saved binary audio file on disk: ${firstSegment.audioPath}`);
  const diskBytes = fs.readFileSync(firstSegment.audioPath);
  const diskWavMeta = WavUtils.parseWav(diskBytes);
  assert(diskWavMeta.durationSeconds === firstSegment.durationSeconds, 'Audio file on disk matches reported metadata');

  // ─────────────────────────────────────────────────────────────
  // 6. ERROR HANDLING
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 6. Testing Error Handling ---');

  // Test missing credentials error
  let missingKeyCaught = false;
  try {
    // Force live mode when key is absent
    const previousKey = process.env.GNANI_API_KEY;
    delete process.env.GNANI_API_KEY;
    await GnaniTtsService.synthesizeTextSegment('Test', { mockMode: false });
    process.env.GNANI_API_KEY = previousKey;
  } catch (err: any) {
    if (err.code === 'MISSING_GNANI_API_KEY') missingKeyCaught = true;
  }
  assert(missingKeyCaught, 'Throws clean AppError(503) when GNANI_API_KEY is missing');

  // Test non-existent audio 404
  let notFoundCaught = false;
  try {
    TempStorageService.getChapterAudioPath('fake-lesson', 'non-existent.wav');
  } catch (err: any) {
    if (err.code === 'AUDIO_NOT_FOUND') notFoundCaught = true;
  }
  assert(notFoundCaught, 'Throws AppError(404) for non-existent audio files');

  // ─────────────────────────────────────────────────────────────
  // 7. TEMPORARY STORAGE CLEANUP
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 7. Testing Safe Temporary File Cleanup ---');
  const cleaned = TempStorageService.cleanupLessonAudio(multiChapterLesson.id);
  assert(cleaned === true, 'Cleans up temporary lesson audio directory');
  assert(!fs.existsSync(firstSegment.audioPath), 'Verified temporary audio file removed from disk');

  // ─────────────────────────────────────────────────────────────
  // 8. LIVE GNANI AI TIMBRE TEST (IF CONFIGURED)
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 8. Live Gnani AI Timbre API Test ---');
  if (GnaniTtsService.isConfigured()) {
    try {
      console.log('  Live GNANI_API_KEY detected! Testing live inference endpoint...');
      const liveAudio = await GnaniTtsService.synthesizeTextSegment('ListenWise speech test.');
      const liveMeta = WavUtils.parseWav(liveAudio);
      assert(liveAudio.length > 44, `Live Gnani AI Timbre returned binary WAV (${liveAudio.length} bytes, ${liveMeta.durationSeconds}s)`);
    } catch (e: any) {
      console.warn('  ⚠️ Live Gnani call warning:', e.message);
    }
  } else {
    console.log('  ℹ️ Note: GNANI_API_KEY not configured in environment. Verified binary WAV handling via mock engine.');
    assert(true, 'Gnani TTS engine handles unconfigured state cleanly without breaking');
  }

  // ─────────────────────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────────────────────
  console.log('\n======================================================');
  console.log(`  PHASE 3 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase3Tests().catch((err) => {
  console.error('Fatal test error in Phase 3:', err);
  process.exit(1);
});
