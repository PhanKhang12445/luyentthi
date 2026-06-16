const pdfParse = require('pdf-parse');
const fs = require('fs');

/**
 * Extract text from PDF file
 */
const extractTextFromPDF = async (filePath) => {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(fileBuffer);
    return data.text;
  } catch (error) {
    console.error('PDF extraction error:', error);
    throw new Error('Failed to extract text from PDF');
  }
};

/**
 * Extract text from plain text file
 */
const extractTextFromTXT = async (filePath) => {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (error) {
    console.error('TXT extraction error:', error);
    throw new Error('Failed to read text file');
  }
};

/**
 * Route file to appropriate handler based on type
 */
const processFile = async (filePath, fileType) => {
  const type = fileType.toLowerCase();
  
  if (type.includes('pdf')) {
    return await extractTextFromPDF(filePath);
  } else if (type.includes('text') || type.includes('plain')) {
    return await extractTextFromTXT(filePath);
  } else if (
    type.includes('image') ||
    type.includes('jpeg') ||
    type.includes('png')
  ) {
    // Return path for OCR processing
    return { isImage: true, path: filePath };
  } else {
    throw new Error('Unsupported file type');
  }
};

module.exports = {
  extractTextFromPDF,
  extractTextFromTXT,
  processFile,
};
