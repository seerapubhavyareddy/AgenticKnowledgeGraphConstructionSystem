/**
 * TypeScript types matching the PostgreSQL database schema
 */

// ============================================================================
// Database Row Types (what comes from the database)
// ============================================================================

export interface PaperRow {
    id: number;
    arxiv_id: string;
    title: string;
    abstract: string | null;
    authors: string[] | null;
    published_date: Date | null;
    pdf_path: string | null;
    full_text: string | null;
    processed_at: Date;
    is_seminal: boolean;
}

export interface ConceptRow {
    id: number;
    name: string;
    description: string | null;
    concept_type: ConceptType;
    mention_count: number;
    created_at: Date;
}

export interface PaperConceptRow {
    id: number;
    paper_id: number;
    concept_id: number;
    relevance_score: number;
    context: string | null;
}

export interface PaperRelationshipRow {
    id: number;
    source_paper_id: number;
    target_paper_id: number;
    relationship_type: RelationshipType;
    explanation: string;
    confidence: number;
    extracted_at: Date;
    validated: boolean;
}

export interface ExtractionLogRow {
    id: number;
    paper_id: number;
    stage: ExtractionStage;
    status: ExtractionStatus;
    error_message: string | null;
    processing_time_seconds: number | null;
    created_at: Date;
}

// ============================================================================
// Enums
// ============================================================================

export type ConceptType =
    | 'method'
    | 'technique'
    | 'dataset'
    | 'metric'
    | 'concept'
    | 'architecture'
    | 'algorithm';

export type RelationshipType =
    | 'improves_on'
    | 'extends'
    | 'evaluates'
    | 'builds_on'
    | 'addresses'
    | 'cites';

export type ExtractionStage =
    | 'pdf_extraction'
    | 'entity_extraction'
    | 'relationship_extraction';

export type ExtractionStatus =
    | 'success'
    | 'failed'
    | 'in_progress';

// ============================================================================
// Agent Input/Output Types
// ============================================================================

/**
 * Entity extracted by the Entity Extraction Agent
 */
export interface ExtractedEntity {
    name: string;
    type: ConceptType;
    description: string;
    relevance_score: number;
    context_snippet: string; // Where in the paper this was mentioned
}

/**
 * Full output from Entity Extraction Agent for one paper
 */
export interface EntityExtractionResult {
    paper_id: number;
    arxiv_id: string;
    entities: ExtractedEntity[];
    extraction_metadata: {
        total_entities: number;
        processing_time_ms: number;
        model_used: string;
        timestamp: string;
    };
}

/**
 * Relationship extracted by Relationship Discovery Agent
 */
export interface ExtractedRelationship {
    source_paper_arxiv: string;
    target_paper_arxiv: string;
    relationship_type: RelationshipType;
    explanation: string;
    confidence: number;
    supporting_evidence: string; // Quote from the paper
}

/**
 * Configuration for agents
 */
export interface AgentConfig {
    anthropicApiKey: string;
    modelName: string;
    maxTokens: number;
    temperature: number;
}

/**
 * Database configuration
 */
export interface DatabaseConfig {
    connectionString: string;
}

// ============================================================================
// Validation Types (Agent #3)
// ============================================================================

export type ValidationSeverity =
    | 'error'      // Critical issue, item should be rejected
    | 'warning'    // Suspicious, flag for review
    | 'info';      // Informational, no action needed

/**
 * Validation issue found by Validation Agent
 */
export interface ValidationIssue {
    severity: ValidationSeverity;
    rule: string;            // Which validation rule triggered
    message: string;         // Human-readable description
    field?: string;          // Which field has the issue
    current_value?: any;     // Current value
    suggested_fix?: string;  // How to fix it
}

/**
 * Validation result for an entity
 */
export interface EntityValidationResult {
    concept_id: number;
    concept_name: string;
    is_valid: boolean;
    issues: ValidationIssue[];
}

/**
 * Validation result for a relationship
 */
export interface RelationshipValidationResult {
    relationship_id: number;
    source_paper_title: string;
    target_paper_title: string;
    relationship_type: RelationshipType | null;
    is_valid: boolean;
    should_flag_for_review: boolean;
    issues: ValidationIssue[];
}