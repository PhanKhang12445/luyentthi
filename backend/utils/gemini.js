const fs = require('fs');

const stripJsonFence = (value) => {
  const text = String(value || '').trim();
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return match ? match[1].trim() : text;
};

const sanitizeSvg = (value) => {
  const svg = String(value || '').trim();

  if (!svg.startsWith('<svg') || !svg.endsWith('</svg>')) {
    return null;
  }

  let cleaned = svg
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '');

  const svgOpenTag = cleaned.match(/<svg\b[^>]*>/i)?.[0] || '';

  if (!/\swidth=/.test(svgOpenTag)) {
    cleaned = cleaned.replace('<svg', '<svg width="640"');
  }

  const svgOpenTagWithWidth = cleaned.match(/<svg\b[^>]*>/i)?.[0] || '';

  if (!/\sheight=/.test(svgOpenTagWithWidth)) {
    cleaned = cleaned.replace('<svg', '<svg height="320"');
  }

  return cleaned;
};

const normalizeGeminiQuestion = (question, index) => {
  const diagramSvg = sanitizeSvg(question.diagram_svg);
  const bbox = question.diagram_bbox || null;
  const diagramBbox = bbox &&
    Number.isFinite(Number(bbox.x)) &&
    Number.isFinite(Number(bbox.y)) &&
    Number.isFinite(Number(bbox.width)) &&
    Number.isFinite(Number(bbox.height))
      ? {
          x: Number(bbox.x),
          y: Number(bbox.y),
          width: Number(bbox.width),
          height: Number(bbox.height),
        }
      : null;

  return {
    question_number: String(question.question_number || index + 1),
    source_index: index + 1,
    question_text: String(question.question_text || '').replace(/\s+/g, ' ').trim(),
    diagram_bbox: diagramBbox,
    diagram_svg: diagramSvg,
    options: [
      { letter: 'A', text: '\u0110\u00fang' },
      { letter: 'B', text: 'Sai' },
    ],
    correct_answer: question.correct_answer === 'B' ? 'B' : 'A',
  };
};

const parseGeminiJson = (text) => {
  const json = JSON.parse(stripJsonFence(text));
  const questions = Array.isArray(json) ? json : json.questions;

  if (!Array.isArray(questions)) {
    return [];
  }

  return questions
    .map(normalizeGeminiQuestion)
    .filter((question) => question.question_text.length > 0);
};

const extractExamWithGemini = async (imagePath, mimeType) => {
  if (!process.env.GEMINI_API_KEY) {
    return null;
  }

  const base64Image = fs.readFileSync(imagePath, { encoding: 'base64' });
  const models = [
    process.env.GEMINI_MODEL,
    'gemini-3.5-flash',
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash-lite',
    'gemini-2.0-flash',
  ]
    .filter(Boolean)
    .map((model) => model.replace(/^models\//, ''));

  const prompt = `
You are extracting a Japanese technical true/false exam from a photographed page.

Rules:
- Return JSON only. No markdown.
- Extract only real numbered questions visible on the page.
- For question_number, read the visible printed/circled number at the left of each question on the page.
- The circled question number is part of the question identity, even when the circle or teacher mark is red.
- Do not renumber questions from 1 on each image. If the page shows 16, output "16"; if it shows 8, output "8".
- Keep only the Japanese question sentence in question_text.
- Remove romanized pronunciation lines such as "B no namae wa besu desu."
- Ignore the student's name, red handwriting, calculations, check marks, and page noise unless a mark clearly indicates the answer.
- If a question has a diagram, return diagram_bbox with the diagram's tight bounding box in normalized image coordinates from 0 to 1000: {x,y,width,height}.
- The bbox must tightly surround the actual visible diagram for that exact question, including labels that belong to the diagram.
- Diagram examples include transistor symbols, circuit diagrams, capacitor/ground symbols, safety signs, and tool drawings.
- A diagram is the black technical drawing/symbol related to the question, usually below the Japanese/romaji text.
- Never return a bbox for the circled question number, red check/cross marks, red handwriting, or answer marks.
- For symbol questions, choose the black electrical/safety/tool symbol, not the question number.
- Do not use a generic page-position guess.
- Do not include Japanese sentence text or romanized reading text above/below the diagram in the bbox.
- If no diagram belongs to the question, return diagram_bbox as null.
- diagram_svg is optional fallback only. Prefer an empty string unless you are confident.
- Do not create answer choices. The app creates A=true and B=false.
- Use correct_answer "A" for true and "B" for false. If the answer is unclear, use "A".
- Preserve the original question_number from the page exactly.
`;

  const requestBody = {
      contents: [{
        parts: [
          {
            inlineData: {
              mimeType,
              data: base64Image,
            },
          },
          { text: prompt },
        ],
      }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            questions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  question_number: { type: 'string' },
                  question_text: { type: 'string' },
                  diagram_bbox: {
                    anyOf: [
                      {
                        type: 'object',
                        properties: {
                          x: { type: 'number' },
                          y: { type: 'number' },
                          width: { type: 'number' },
                          height: { type: 'number' },
                        },
                        required: ['x', 'y', 'width', 'height'],
                      },
                      { type: 'null' },
                    ],
                  },
                  diagram_svg: { type: 'string' },
                  correct_answer: { type: 'string', enum: ['A', 'B'] },
                },
                required: ['question_number', 'question_text', 'diagram_bbox', 'diagram_svg', 'correct_answer'],
              },
            },
          },
          required: ['questions'],
        },
      },
  };

  let lastError;

  for (const model of models) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const body = await response.text();
      lastError = new Error(`Gemini API error (${model}): ${response.status} ${body}`);

      if (response.status === 429 || response.status === 404) {
        continue;
      }

      throw lastError;
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('\n') || '';
    return parseGeminiJson(text);
  }

  throw lastError || new Error('Gemini extraction failed');
};

module.exports = {
  extractExamWithGemini,
};
