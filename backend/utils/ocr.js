const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

/**
 * Preprocess image to improve OCR accuracy
 * - Convert to grayscale
 * - Increase contrast
 * - Sharpen
 */
const preprocessImage = async (inputPath) => {
  const outputPath = path.join(
    path.dirname(inputPath),
    `processed_${Date.now()}.png`
  );
  
  try {
    await sharp(inputPath)
      .resize({ width: 1800, withoutEnlargement: true })
      .grayscale()
      .normalize()
      .sharpen()
      .toFile(outputPath);
    
    return outputPath;
  } catch (error) {
    console.error('Image preprocessing error:', error);
    throw new Error('Failed to preprocess image');
  }
};

/**
 * Extract text from image using Tesseract OCR
 */
const extractTextFromImage = async (imagePath) => {
  try {
    // Preprocess image first
    const processedPath = await preprocessImage(imagePath);
    
    // Run OCR
    const result = await Tesseract.recognize(
      processedPath,
      process.env.OCR_LANG || 'eng+jpn',
      {
        logger: m => console.log('OCR Progress:', m.progress),
        tessedit_pageseg_mode: '6',
      }
    );

    const questionImages = await extractQuestionImages(imagePath, result.data.lines || []);
    
    // Clean up processed image
    fs.unlinkSync(processedPath);
    
    return {
      text: result.data.text,
      questionImages,
    };
  } catch (error) {
    console.error('OCR extraction error:', error);
    throw new Error('Failed to extract text from image');
  }
};

const getLineText = (line) => (line.text || '').replace(/\s+/g, ' ').trim();

const getLineTop = (line) => {
  if (line.bbox && typeof line.bbox.y0 === 'number') return line.bbox.y0;
  if (typeof line.y0 === 'number') return line.y0;
  return null;
};

const isQuestionStartLine = (line) => (
  /^([✓✔√vV✗×xX\/\\\s]*)\(?[0-9]{1,3}\)?[.)]?\s+/.test(getLineText(line))
);

const extractQuestionImages = async (imagePath, lines) => {
  const metadata = await sharp(imagePath).metadata();
  const imageHeight = metadata.height;
  const imageWidth = metadata.width;

  if (!imageHeight || !imageWidth) return {};

  const starts = lines
    .map((line) => ({
      text: getLineText(line),
      top: getLineTop(line),
    }))
    .filter((line) => line.top !== null && isQuestionStartLine(line));

  if (starts.length === 0) return {};

  const outputDir = path.join(path.dirname(imagePath), 'question-images');
  fs.mkdirSync(outputDir, { recursive: true });

  const crops = {};
  const prefix = path.basename(imagePath, path.extname(imagePath));

  for (let i = 0; i < starts.length; i += 1) {
    const numberMatch = starts[i].text.match(/\(?([0-9]{1,3})\)?/);
    if (!numberMatch) continue;

    const questionNumber = numberMatch[1];
    const top = Math.max(0, Math.floor(starts[i].top - 35));
    const nextTop = starts[i + 1] ? starts[i + 1].top : imageHeight;
    const bottom = Math.min(imageHeight, Math.ceil(nextTop - 12));
    const height = bottom - top;

    if (height < 80) continue;

    const filename = `${prefix}-q${questionNumber}.png`;
    const outputPath = path.join(outputDir, filename);

    await sharp(imagePath)
      .extract({
        left: 0,
        top,
        width: imageWidth,
        height,
      })
      .toFile(outputPath);

    crops[questionNumber] = `/uploads/question-images/${filename}`;
  }

  return crops;
};

const createFallbackQuestionImages = async (imagePath, questions) => {
  const metadata = await sharp(imagePath).metadata();
  const imageHeight = metadata.height;
  const imageWidth = metadata.width;

  if (!imageHeight || !imageWidth || questions.length === 0) return {};

  const outputDir = path.join(path.dirname(imagePath), 'question-images');
  fs.mkdirSync(outputDir, { recursive: true });

  const crops = {};
  const prefix = path.basename(imagePath, path.extname(imagePath));
  const topMargin = Math.round(imageHeight * 0.04);
  const bottomMargin = Math.round(imageHeight * 0.02);
  const usableHeight = imageHeight - topMargin - bottomMargin;
  const sliceHeight = usableHeight / questions.length;

  for (let i = 0; i < questions.length; i += 1) {
    const questionNumber = questions[i].question_number;
    const top = Math.max(0, Math.floor(topMargin + (sliceHeight * i) - 16));
    const nextTop = i === questions.length - 1
      ? imageHeight - bottomMargin
      : Math.ceil(topMargin + (sliceHeight * (i + 1)) + 16);
    const height = Math.min(imageHeight - top, nextTop - top);

    if (height < 40) continue;

    const filename = `${prefix}-fallback-q${questionNumber}.png`;
    const outputPath = path.join(outputDir, filename);

    await sharp(imagePath)
      .extract({
        left: 0,
        top,
        width: imageWidth,
        height,
      })
      .toFile(outputPath);

    crops[questionNumber] = `/uploads/question-images/${filename}`;
  }

  return crops;
};

module.exports = {
  createFallbackQuestionImages,
  extractTextFromImage,
  preprocessImage,
};
