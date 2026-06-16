/**
 * Parser for extracting exam questions from OCR/PDF/TXT text.
 *
 * Supported formats:
 * 1. Multiple choice:
 *    Cau 1: Question text?
 *    A. Option A
 *    B. Option B
 *    Dap an: A
 *
 * 2. Numbered true/false statements:
 *    1 LCD ... desu.
 *    2 B no namae ...
 */

const normalizeText = (text) => (
  text
    .replace(/\r/g, '')
    .replace(/[：]/g, ':')
    .replace(/[．]/g, '.')
    .replace(/[＿]/g, '_')
    .replace(/[①]/g, '\n1 ')
    .replace(/[②]/g, '\n2 ')
    .replace(/[③]/g, '\n3 ')
    .replace(/[④]/g, '\n4 ')
    .replace(/[⑤]/g, '\n5 ')
    .replace(/[⑥]/g, '\n6 ')
    .replace(/[⑦]/g, '\n7 ')
    .replace(/[⑧]/g, '\n8 ')
    .replace(/[⑨]/g, '\n9 ')
    .replace(/[⑩]/g, '\n10 ')
    .replace(/([^\n])\s+([✓✔√vV✗×xX\/\\])\s+([0-9]{1,3})\s+(?=[A-Z\u3040-\u30ff\u3400-\u9fff])/g, '$1\n$2 $3 ')
    .replace(/([^\n])\s+([0-9]{1,3})\s+(?=[A-Z\u3040-\u30ff\u3400-\u9fff])/g, '$1\n$2 ')
);

const cleanLine = (line) => line.replace(/\s+/g, ' ').trim();

const hasJapanese = (value) => /[\u3040-\u30ff\u3400-\u9fff]/.test(value);

const looksLikeRomajiReading = (value) => {
  const line = value.toLowerCase();
  const tokens = line.match(/[a-z']+/g) || [];

  if (hasJapanese(value) || tokens.length < 3) return false;

  const romajiWords = new Set([
    'a', 'an', 'analog', 'arimasen', 'besu', 'buraunkan', 'daiodo', 'de',
    'dekimasu', 'den', 'denatsu', 'denchi', 'denryu', 'desu', 'disupurei',
    'ga', 'handoutai', 'i', 'kairo', 'keisoku', 'koto', 'mamae', 'namae',
    'naku', 'nakutemo', 'ni', 'no', 'o', 'sokutei', 'shurui', 'suru',
    'tauta', 'towa', 'tsukatta', 'tsukawaremasu', 'wa', 'yomitori',
  ]);

  const romajiCount = tokens.filter((token) => romajiWords.has(token)).length;

  return romajiCount >= Math.min(3, tokens.length);
};

const removeRomajiReadings = (value) => {
  const pipeParts = value.split('|').map(cleanLine).filter(Boolean);
  const parts = pipeParts.length > 1 ? pipeParts : value.split(/\s{2,}/).map(cleanLine).filter(Boolean);
  const filtered = parts.filter((part) => !looksLikeRomajiReading(part));

  if (filtered.length > 0 && filtered.length < parts.length) {
    return cleanLine(filtered.join(' '));
  }

  return looksLikeRomajiReading(value) ? '' : cleanLine(value);
};

const trueFalseOptions = () => [
  { letter: 'A', text: 'Đúng' },
  { letter: 'B', text: 'Sai' },
];

const parseMultipleChoice = (text) => {
  const questions = [];
  const questionPattern = /(?:^|\n)\s*(?:C(?:au|âu)|Question|Q)\s*(\d+)\s*[:.)-]\s*/gi;
  const matches = [...text.matchAll(questionPattern)];

  for (let i = 0; i < matches.length; i += 1) {
    const current = matches[i];
    const next = matches[i + 1];
    const questionNum = current[1];
    const contentStart = current.index + current[0].length;
    const contentEnd = next ? next.index : text.length;
    const questionContent = text.slice(contentStart, contentEnd).trim();

    if (!questionContent) continue;

    const optionPattern = /(?:^|\n)\s*([A-Z])\s*[.)]\s+(.+?)(?=\n\s*[A-Z]\s*[.)]\s+|\n\s*(?:Dap\s*an|Answer|Ans)\b|$)/gis;
    const options = [];
    let optionMatch;

    while ((optionMatch = optionPattern.exec(questionContent)) !== null) {
      options.push({
        letter: optionMatch[1].toUpperCase(),
        text: cleanLine(optionMatch[2]),
      });
    }

    const firstOptionIndex = questionContent.search(/(?:^|\n)\s*[A-Z]\s*[.)]\s+/);
    const questionText = removeRomajiReadings(
      firstOptionIndex >= 0 ? questionContent.slice(0, firstOptionIndex) : questionContent.split('\n')[0]
    );

    const answerMatch = questionContent.match(/(?:Dap\s*an|Answer|Ans)\s*[:.)-]?\s*([A-Z])/i);
    const correctAnswer = answerMatch ? answerMatch[1].toUpperCase() : null;

    if (questionText && options.length > 0 && correctAnswer) {
      questions.push({
        question_number: questionNum,
        question_text: questionText,
        options,
        correct_answer: correctAnswer,
      });
    } else if (questionText && options.length === 0) {
      questions.push({
        question_number: questionNum,
        question_text: questionText,
        options: trueFalseOptions(),
        correct_answer: 'A',
      });
    }
  }

  return questions;
};

const markerToAnswer = (marker) => {
  if (!marker) return null;

  if (/[✓✔√v]/i.test(marker)) return 'A';
  if (/[✗×x\/\\]/i.test(marker)) return 'B';

  return null;
};

const parseNumberedStatements = (text) => {
  const questions = [];
  const lines = text
    .replace(/([。.!?])\s+([✓✔√vV✗×xX\/\\])\s+([0-9]{1,3})\s+(?=[A-Z\u3040-\u30ff\u3400-\u9fff])/g, '$1\n$2 $3 ')
    .replace(/([。.!?])\s+([0-9]{1,3})\s+(?=[A-Z\u3040-\u30ff\u3400-\u9fff])/g, '$1\n$2 ')
    .split('\n')
    .map(cleanLine)
    .filter(Boolean);

  let current = null;

  const flush = () => {
    if (!current || current.lines.length === 0) return;

    const visibleLines = current.lines.filter((line) => !looksLikeRomajiReading(line));
    const questionText = removeRomajiReadings(visibleLines.join(' '));
    if (!questionText || questionText.length < 8) return;

    questions.push({
      question_number: current.number,
      question_text: questionText,
      options: trueFalseOptions(),
      correct_answer: current.correctAnswer || 'A',
    });
  };

  for (const line of lines) {
    const match = line.match(/^([✓✔√vV✗×xX\/\\\s]*)\(?([0-9]{1,3})\)?[.)]?\s+(.+)$/);

    if (match) {
      flush();
      current = {
        number: match[2],
        correctAnswer: markerToAnswer(match[1]),
        lines: [match[3]],
      };
      continue;
    }

    if (current) {
      current.lines.push(line);
    }
  }

  flush();

  return questions;
};

const parseExamText = (rawText) => {
  const text = normalizeText(rawText || '');
  const multipleChoiceQuestions = parseMultipleChoice(text);

  if (multipleChoiceQuestions.length > 0) {
    return multipleChoiceQuestions;
  }

  return parseNumberedStatements(text);
};

const validateQuestion = (question) => {
  return (
    question.question_text &&
    question.options &&
    question.options.length > 0 &&
    question.correct_answer
  );
};

module.exports = {
  parseExamText,
  validateQuestion,
};
