const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const Tesseract = require('tesseract.js');

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const createDiagramImages = async (imagePath, questions) => {
  const metadata = await sharp(imagePath).metadata();
  const imageWidth = metadata.width;
  const imageHeight = metadata.height;

  if (!imageWidth || !imageHeight) {
    return {};
  }

  const outputDir = path.join(path.dirname(imagePath), 'question-diagrams');
  fs.mkdirSync(outputDir, { recursive: true });

  const prefix = path.basename(imagePath, path.extname(imagePath));
  const diagramImages = {};

  for (const question of questions) {
    const bbox = question.diagram_bbox;

    if (!bbox) continue;

    const region = {
      left: Math.floor((bbox.x / 1000) * imageWidth),
      top: Math.floor((bbox.y / 1000) * imageHeight),
      width: Math.ceil((bbox.width / 1000) * imageWidth),
      height: Math.ceil((bbox.height / 1000) * imageHeight),
    };
    const diagramKey = question.source_index || question.question_number;
    const imageUrl = await cropDiagramByInkRegion(
      imagePath,
      diagramKey,
      region,
      'diagram'
    );

    if (imageUrl) {
      diagramImages[diagramKey] = imageUrl;
    }
  }

  return diagramImages;
};

const isDarkInk = (r, g, b) => {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const isRedInk = r > g + 20 && r > b + 20;

  // Keep black printed strokes; skip red handwriting and pale background noise.
  return !isRedInk && max < 120 && (max - min) < 55;
};

const findInkBounds = async (imagePath, region) => {
  const { data, info } = await sharp(imagePath)
    .extract(region)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  const rowInkCounts = new Array(info.height).fill(0);

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const index = (y * info.width + x) * info.channels;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];

      if (!isDarkInk(r, g, b)) continue;

      rowInkCounts[y] += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) {
    return null;
  }

  const inkRows = [];
  const rowThreshold = Math.max(3, Math.floor(info.width * 0.004));

  for (let y = 0; y < rowInkCounts.length; y += 1) {
    if (rowInkCounts[y] >= rowThreshold) {
      inkRows.push(y);
    }
  }

  if (inkRows.length > 0) {
    let keepBottom = inkRows[inkRows.length - 1];
    const largeGap = Math.max(34, Math.floor(info.height * 0.1));

    for (let i = 1; i < inkRows.length; i += 1) {
      const gap = inkRows[i] - inkRows[i - 1];

      if (gap > largeGap && inkRows[i - 1] > 20) {
        keepBottom = inkRows[i - 1];
        break;
      }
    }

    maxY = Math.min(maxY, keepBottom);
  }

  return {
    left: region.left + minX,
    top: region.top + minY,
    right: region.left + maxX + 1,
    bottom: region.top + maxY + 1,
  };
};

const cropDiagramByInkRegion = async (imagePath, questionNumber, region, filenameSuffix) => {
  const metadata = await sharp(imagePath).metadata();
  const imageWidth = metadata.width;
  const imageHeight = metadata.height;

  if (!imageWidth || !imageHeight) return null;

  const safeRegion = {
    left: clamp(region.left, 0, imageWidth - 1),
    top: clamp(region.top, 0, imageHeight - 1),
    width: clamp(region.width, 1, imageWidth - clamp(region.left, 0, imageWidth - 1)),
    height: clamp(region.height, 1, imageHeight - clamp(region.top, 0, imageHeight - 1)),
  };

  const bounds = await findInkBounds(imagePath, safeRegion);

  if (!bounds) return null;

  const paddingX = 32;
  const paddingTop = 24;
  const paddingBottom = 0;
  const left = clamp(bounds.left - paddingX, 0, imageWidth - 1);
  const top = clamp(bounds.top - paddingTop, 0, imageHeight - 1);
  const right = clamp(bounds.right + paddingX, left + 1, imageWidth);
  const bottom = clamp(bounds.bottom + paddingBottom, top + 1, imageHeight);
  const width = right - left;
  const height = bottom - top;

  if (width < 60 || height < 60) return null;

  const outputDir = path.join(path.dirname(imagePath), 'question-diagrams');
  fs.mkdirSync(outputDir, { recursive: true });

  const prefix = path.basename(imagePath, path.extname(imagePath));
  const filename = `${prefix}-${filenameSuffix}-q${questionNumber}.png`;
  const outputPath = path.join(outputDir, filename);

  await sharp(imagePath)
    .extract({ left, top, width, height })
    .png()
    .toFile(outputPath);

  return `/uploads/question-diagrams/${filename}`;
};

const createDiagramImagesFromQuestionRegions = async (imagePath) => {
  // These regions come from OCR line positions on the photographed page:
  // q2 diagram is below the romaji line for q2; q7 diagram is below q7 romaji.
  // The crop then shrinks to the actual black printed ink, so it preserves the original diagram.
  const metadata = await sharp(imagePath).metadata();
  const imageWidth = metadata.width;
  const imageHeight = metadata.height;

  if (!imageWidth || !imageHeight) return {};

  const regions = {
    2: {
      left: Math.round(imageWidth * 0.18),
      top: Math.round(imageHeight * 0.235),
      width: Math.round(imageWidth * 0.38),
      height: Math.round(imageHeight * 0.14),
    },
    7: {
      left: Math.round(imageWidth * 0.18),
      top: Math.round(imageHeight * 0.765),
      width: Math.round(imageWidth * 0.48),
      height: Math.round(imageHeight * 0.125),
    },
  };

  const output = {};

  for (const [questionNumber, region] of Object.entries(regions)) {
    const imageUrl = await cropDiagramByInkRegion(
      imagePath,
      questionNumber,
      region,
      'ink-diagram'
    );

    if (imageUrl) {
      output[questionNumber] = imageUrl;
    }
  }

  return output;
};

const normalizeLineText = (text) => String(text || '').replace(/\s+/g, ' ').trim();

const isQuestionStartText = (text) => {
  const value = normalizeLineText(text);

  return /^([①②③④⑤⑥⑦⑧⑨⑩]|\(?\d{1,3}\)?[.)、,]?)/.test(value);
};

const getLineTop = (line) => line.bbox?.y0 ?? line.y0 ?? 0;
const getLineBottom = (line) => line.bbox?.y1 ?? line.y1 ?? getLineTop(line);

const getOcrLines = async (imagePath) => {
  const result = await Tesseract.recognize(imagePath, 'eng+jpn', { logger: () => {} });

  return (result.data.lines || [])
    .map((line) => ({
      text: normalizeLineText(line.text),
      top: getLineTop(line),
      bottom: getLineBottom(line),
    }))
    .filter((line) => line.text)
    .sort((a, b) => a.top - b.top);
};

const createDiagramImagesFromOcrLayout = async (imagePath, questions) => {
  const metadata = await sharp(imagePath).metadata();
  const imageWidth = metadata.width;
  const imageHeight = metadata.height;

  if (!imageWidth || !imageHeight) return {};

  const diagramQuestions = questions.filter((question) => question.diagram_bbox);

  if (diagramQuestions.length === 0) return {};

  const lines = await getOcrLines(imagePath);
  const startLines = lines.filter((line) => isQuestionStartText(line.text));
  const output = {};

  for (const question of diagramQuestions) {
    const questionIndex = questions.findIndex(
      (candidate) => candidate.question_number === question.question_number
    );
    const startLine = startLines[questionIndex];

    if (!startLine) continue;

    const nextStartLine = startLines[questionIndex + 1];
    const blockBottom = nextStartLine
      ? Math.max(startLine.bottom + 80, nextStartLine.top - 12)
      : imageHeight - Math.round(imageHeight * 0.04);
    const blockLines = lines.filter(
      (line) => line.top >= startLine.top && line.top < blockBottom
    );
    const readingLines = blockLines.slice(0, 2);
    const searchTop = Math.min(
      blockBottom - 40,
      Math.max(...readingLines.map((line) => line.bottom), startLine.bottom) + 20
    );

    if (blockBottom <= searchTop + 30) continue;

    const region = {
      left: Math.round(imageWidth * 0.12),
      top: Math.round(searchTop),
      width: Math.round(imageWidth * 0.76),
      height: Math.round(blockBottom - searchTop),
    };
    const imageUrl = await cropDiagramByInkRegion(
      imagePath,
      question.question_number,
      region,
      'layout-diagram'
    );

    if (imageUrl) {
      output[question.question_number] = imageUrl;
    }
  }

  return output;
};

module.exports = {
  createDiagramImages,
  createDiagramImagesFromQuestionRegions,
  createDiagramImagesFromOcrLayout,
};
