-- Exam Preparation Database Schema
-- PostgreSQL

-- Create tables only if they do not already exist. This preserves registered users and existing data.

CREATE TABLE IF NOT EXISTS app_user (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auth_session (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Exam table
CREATE TABLE IF NOT EXISTS exam (
  id UUID PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  created_by VARCHAR(255),
  status VARCHAR(20) DEFAULT 'draft',
  pass_score INTEGER DEFAULT 80,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Question table
CREATE TABLE IF NOT EXISTS question (
  id UUID PRIMARY KEY,
  exam_id UUID NOT NULL REFERENCES exam(id) ON DELETE CASCADE,
  question_number INTEGER,
  question_text TEXT NOT NULL,
  source_image_path TEXT,
  image_path TEXT,
  diagram_image_path TEXT,
  diagram_svg TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Answer Option table
CREATE TABLE IF NOT EXISTS answer_option (
  id UUID PRIMARY KEY,
  question_id UUID NOT NULL REFERENCES question(id) ON DELETE CASCADE,
  option_text TEXT NOT NULL,
  is_correct BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Exam History table (for tracking user performance)
CREATE TABLE IF NOT EXISTS exam_history (
  id UUID PRIMARY KEY,
  exam_id UUID NOT NULL REFERENCES exam(id) ON DELETE CASCADE,
  score DECIMAL(5, 2) NOT NULL,
  final_grade VARCHAR(50),
  details JSONB,
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_question_exam_id ON question(exam_id);
CREATE INDEX IF NOT EXISTS idx_answer_option_question_id ON answer_option(question_id);
CREATE INDEX IF NOT EXISTS idx_exam_history_exam_id ON exam_history(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_created_at ON exam(created_at);
CREATE INDEX IF NOT EXISTS idx_auth_session_token_hash ON auth_session(token_hash);
CREATE INDEX IF NOT EXISTS idx_exam_created_by ON exam(created_by);
