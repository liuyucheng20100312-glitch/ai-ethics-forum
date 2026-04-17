CREATE TABLE IF NOT EXISTS ib_discipline (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  name_en VARCHAR(100) NOT NULL,
  name_cn VARCHAR(100) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ib_subject (
  id SERIAL PRIMARY KEY,
  discipline_id INT REFERENCES ib_discipline(id),
  code VARCHAR(50) UNIQUE NOT NULL,
  name_en VARCHAR(150) NOT NULL,
  name_cn VARCHAR(150) NOT NULL,
  level VARCHAR(10) NOT NULL CHECK (level IN ('HL', 'SL', 'BOTH')),
  syllabus_url VARCHAR(500),
  aliases TEXT[] DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS ib_knowledge_point (
  id SERIAL PRIMARY KEY,
  subject_id INT REFERENCES ib_subject(id),
  parent_id INT REFERENCES ib_knowledge_point(id),
  level INT NOT NULL CHECK (level IN (1, 2, 3)),
  code VARCHAR(100) UNIQUE NOT NULL,
  name_en VARCHAR(200) NOT NULL,
  name_cn VARCHAR(200) NOT NULL,
  description TEXT,
  hl_sl VARCHAR(10) NOT NULL CHECK (hl_sl IN ('HL', 'SL', 'BOTH')),
  weight DECIMAL(5, 2),
  ao_targets VARCHAR(20)[] DEFAULT '{}',
  command_terms VARCHAR(100)[] DEFAULT '{}',
  prerequisite_ids INT[] DEFAULT '{}',
  sort_order INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ib_material (
  id SERIAL PRIMARY KEY,
  subject_id INT REFERENCES ib_subject(id),
  subject_code VARCHAR(50),
  type VARCHAR(50) NOT NULL CHECK (
    type IN (
      'SYLLABUS',
      'PAST_PAPER',
      'MARK_SCHEME',
      'KNOWLEDGE_NOTE',
      'IA_EE_GUIDE',
      'COMMAND_TERM_GUIDE',
      'VIDEO_TRANSCRIPT'
    )
  ),
  title_en VARCHAR(200) NOT NULL,
  title_cn VARCHAR(200) NOT NULL,
  hl_sl VARCHAR(10) NOT NULL CHECK (hl_sl IN ('HL', 'SL', 'BOTH')),
  difficulty INT CHECK (difficulty BETWEEN 1 AND 5),
  year INT,
  paper VARCHAR(20),
  timezone VARCHAR(20),
  file_url VARCHAR(500) NOT NULL,
  file_type VARCHAR(20) CHECK (file_type IN ('PDF', 'DOCX', 'TXT', 'MD')),
  total_tokens INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ib_material_chunk (
  id SERIAL PRIMARY KEY,
  material_id INT REFERENCES ib_material(id) ON DELETE CASCADE,
  knowledge_point_ids INT[] DEFAULT '{}',
  chunk_index INT NOT NULL,
  content TEXT NOT NULL,
  start_pos INT,
  end_pos INT,
  token_count INT,
  milvus_vector_id VARCHAR(100) UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ib_subject_discipline_id ON ib_subject(discipline_id);
CREATE INDEX IF NOT EXISTS idx_ib_knowledge_point_subject_id ON ib_knowledge_point(subject_id);
CREATE INDEX IF NOT EXISTS idx_ib_knowledge_point_parent_id ON ib_knowledge_point(parent_id);
CREATE INDEX IF NOT EXISTS idx_ib_material_subject_id ON ib_material(subject_id);
CREATE INDEX IF NOT EXISTS idx_ib_material_subject_code ON ib_material(subject_code);
CREATE INDEX IF NOT EXISTS idx_ib_material_chunk_material_id ON ib_material_chunk(material_id);
CREATE INDEX IF NOT EXISTS idx_ib_material_chunk_milvus_vector_id ON ib_material_chunk(milvus_vector_id);
