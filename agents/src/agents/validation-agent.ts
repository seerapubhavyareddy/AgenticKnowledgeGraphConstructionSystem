/**
 * Validation Agent (Agent #3)
 * 
 * Rule-based validator that checks for logical errors and inconsistencies
 * in extracted entities and relationships.
 * 
 * Design Decision: Rule-based (no LLM calls) for:
 * - Faster execution
 * - Deterministic behavior
 * - Lower cost
 * - Sufficient for common error patterns
 */

import {
    ConceptRow,
    PaperConceptRow,
    PaperRelationshipRow,
    RelationshipType,
    ValidationIssue,
    ValidationSeverity,
    EntityValidationResult,
    RelationshipValidationResult
} from '../types';

export class ValidationAgent {

    constructor() {
        // No configuration needed for rule-based validation
    }

    // ========================================================================
    // Entity Validation Rules
    // ========================================================================

    /**
     * Validate a concept entity
     */
    validateConcept(
        concept: ConceptRow,
        paperLinks: PaperConceptRow[]
    ): EntityValidationResult {
        const issues: ValidationIssue[] = [];

        // Rule 1: No generic/meta terms
        this.checkGenericTerms(concept, issues);

        // Rule 2: Name length validation
        this.checkNameLength(concept, issues);

        // Rule 3: Relevance score validation (from paper links)
        this.checkRelevanceScores(concept, paperLinks, issues);

        // Rule 4: Mention consistency
        this.checkMentionConsistency(concept, paperLinks, issues);

        const is_valid = !issues.some(issue => issue.severity === 'error');

        return {
            concept_id: concept.id,
            concept_name: concept.name,
            is_valid,
            issues
        };
    }

    /**
     * Rule 1: Check for generic/meta terms that should not be concepts
     */
    private checkGenericTerms(concept: ConceptRow, issues: ValidationIssue[]): void {
        const genericTerms = [
            'paper', 'research', 'method', 'technique', 'approach', 'study',
            'experiment', 'result', 'conclusion', 'abstract', 'introduction',
            'related work', 'future work', 'dataset', 'metric', 'evaluation'
        ];

        const lowerName = concept.name.toLowerCase().trim();

        if (genericTerms.includes(lowerName)) {
            issues.push({
                severity: 'error',
                rule: 'no_generic_terms',
                message: `"${concept.name}" is too generic to be a useful concept`,
                field: 'name',
                current_value: concept.name,
                suggested_fix: 'Extract more specific concepts (e.g., "NeRF" instead of "method")'
            });
        }
    }

    /**
     * Rule 2: Check name length (too short or suspiciously long)
     */
    private checkNameLength(concept: ConceptRow, issues: ValidationIssue[]): void {
        const name = concept.name.trim();

        if (name.length < 2) {
            issues.push({
                severity: 'error',
                rule: 'name_too_short',
                message: `Concept name "${name}" is too short (${name.length} chars)`,
                field: 'name',
                current_value: name,
                suggested_fix: 'Names should be at least 2 characters'
            });
        }

        if (name.length > 100) {
            issues.push({
                severity: 'warning',
                rule: 'name_too_long',
                message: `Concept name is suspiciously long (${name.length} chars)`,
                field: 'name',
                current_value: `${name.slice(0, 50)}...`,
                suggested_fix: 'Consider shortening to key phrase'
            });
        }
    }

    /**
     * Rule 3: Check relevance scores from paper links
     */
    private checkRelevanceScores(
        concept: ConceptRow,
        paperLinks: PaperConceptRow[],
        issues: ValidationIssue[]
    ): void {
        for (const link of paperLinks) {
            // Invalid range check
            if (link.relevance_score < 0 || link.relevance_score > 1) {
                issues.push({
                    severity: 'error',
                    rule: 'invalid_relevance_score',
                    message: `Relevance score ${link.relevance_score} is outside valid range [0, 1]`,
                    field: 'relevance_score',
                    current_value: link.relevance_score,
                    suggested_fix: 'Clamp to [0, 1] range'
                });
            }

            // Suspiciously perfect scores
            if (link.relevance_score === 1.0 && concept.mention_count === 1) {
                issues.push({
                    severity: 'warning',
                    rule: 'suspicious_perfect_score',
                    message: `Relevance 1.0 but concept mentioned in only 1 paper - may be overstated`,
                    field: 'relevance_score',
                    current_value: 1.0,
                    suggested_fix: 'Verify this is truly the core contribution'
                });
            }
        }
    }

    /**
     * Rule 4: Check mention count consistency
     */
    private checkMentionConsistency(
        concept: ConceptRow,
        paperLinks: PaperConceptRow[],
        issues: ValidationIssue[]
    ): void {
        const actualLinkCount = paperLinks.length;

        // Note: mention_count may not equal link count if concept appears
        // multiple times in same paper, but they should be close
        if (concept.mention_count < actualLinkCount) {
            issues.push({
                severity: 'warning',
                rule: 'mention_count_mismatch',
                message: `Mention count (${concept.mention_count}) < paper links (${actualLinkCount})`,
                field: 'mention_count',
                current_value: concept.mention_count,
                suggested_fix: `Should be at least ${actualLinkCount}`
            });
        }
    }

    // ========================================================================
    // Relationship Validation Rules
    // ========================================================================

    /**
     * Validate a relationship between papers
     */
    validateRelationship(
        relationship: PaperRelationshipRow & { source_title: string; target_title: string }
    ): RelationshipValidationResult {
        const issues: ValidationIssue[] = [];

        // Rule 1: No self-references
        this.checkSelfReference(relationship, issues);

        // Rule 2: Confidence score validation
        this.checkConfidenceScore(relationship, issues);

        // Rule 3: Type-explanation consistency
        this.checkTypeExplanationConsistency(relationship, issues);

        // Rule 4: Null relationship type validation
        this.checkNullRelationshipType(relationship, issues);

        // Rule 5: Explanation quality
        this.checkExplanationQuality(relationship, issues);

        const is_valid = !issues.some(issue => issue.severity === 'error');
        const should_flag_for_review =
            relationship.confidence < 0.5 ||
            issues.some(issue => issue.severity === 'warning');

        return {
            relationship_id: relationship.id,
            source_paper_title: relationship.source_title,
            target_paper_title: relationship.target_title,
            relationship_type: relationship.relationship_type,
            is_valid,
            should_flag_for_review,
            issues
        };
    }

    /**
     * Rule 1: Check for self-references (paper referencing itself)
     */
    private checkSelfReference(
        relationship: PaperRelationshipRow,
        issues: ValidationIssue[]
    ): void {
        if (relationship.source_paper_id === relationship.target_paper_id) {
            issues.push({
                severity: 'error',
                rule: 'self_reference',
                message: 'Paper cannot have a relationship with itself',
                field: 'source_paper_id / target_paper_id',
                current_value: `${relationship.source_paper_id} → ${relationship.target_paper_id}`,
                suggested_fix: 'Remove this relationship'
            });
        }
    }

    /**
     * Rule 2: Validate confidence score range and flag low confidence
     */
    private checkConfidenceScore(
        relationship: PaperRelationshipRow,
        issues: ValidationIssue[]
    ): void {
        const conf = relationship.confidence;

        // Invalid range
        if (conf < 0 || conf > 1) {
            issues.push({
                severity: 'error',
                rule: 'invalid_confidence',
                message: `Confidence ${conf} is outside valid range [0, 1]`,
                field: 'confidence',
                current_value: conf,
                suggested_fix: 'Clamp to [0, 1] range'
            });
        }

        // Low confidence - flag for human review
        if (conf < 0.5 && conf >= 0) {
            issues.push({
                severity: 'warning',
                rule: 'low_confidence',
                message: `Low confidence score (${conf.toFixed(2)}) - recommend human review`,
                field: 'confidence',
                current_value: conf,
                suggested_fix: 'Flag for human review or re-extract with better prompting'
            });
        }

        // Very low confidence - might be spurious
        if (conf < 0.3 && conf >= 0) {
            issues.push({
                severity: 'warning',
                rule: 'very_low_confidence',
                message: `Very low confidence (${conf.toFixed(2)}) - relationship may be spurious`,
                field: 'confidence',
                current_value: conf,
                suggested_fix: 'Consider removing or re-extracting'
            });
        }
    }

    /**
     * Rule 3: Check that relationship type matches explanation
     */
    private checkTypeExplanationConsistency(
        relationship: PaperRelationshipRow,
        issues: ValidationIssue[]
    ): void {
        const type = relationship.relationship_type;
        const explanation = relationship.explanation.toLowerCase();

        if (!type) {
            return; // Handled by checkNullRelationshipType
        }

        // Define keywords that should appear for each relationship type
        const typeKeywords: Record<RelationshipType, string[]> = {
            'improves_on': ['improve', 'better', 'faster', 'enhance', 'outperform', 'superior'],
            'extends': ['extend', 'add', 'generalize', 'expand', 'augment', 'additional'],
            'evaluates': ['evaluate', 'compare', 'benchmark', 'test', 'measure', 'assess'],
            'builds_on': ['build', 'based on', 'foundation', 'leverage', 'adopt', 'use'],
            'addresses': ['address', 'solve', 'fix', 'tackle', 'handle', 'overcome'],
            'cites': ['cite', 'mention', 'reference', 'related work', 'discuss']
        };

        const expectedKeywords = typeKeywords[type];
        const hasMatchingKeyword = expectedKeywords.some(keyword =>
            explanation.includes(keyword)
        );

        if (!hasMatchingKeyword) {
            issues.push({
                severity: 'warning',
                rule: 'type_explanation_mismatch',
                message: `Relationship type "${type}" but explanation doesn't contain expected keywords`,
                field: 'explanation',
                current_value: `Type: ${type}`,
                suggested_fix: `Explanation should mention: ${expectedKeywords.join(', ')}`
            });
        }
    }

    /**
     * Rule 4: Validate null relationship types
     */
    private checkNullRelationshipType(
        relationship: PaperRelationshipRow,
        issues: ValidationIssue[]
    ): void {
        if (!relationship.relationship_type) {
            // Null type with high confidence is suspicious
            if (relationship.confidence > 0.5) {
                issues.push({
                    severity: 'warning',
                    rule: 'null_type_high_confidence',
                    message: `Relationship type is null but confidence is ${relationship.confidence.toFixed(2)}`,
                    field: 'relationship_type',
                    current_value: null,
                    suggested_fix: 'Either assign a type or lower confidence'
                });
            } else {
                issues.push({
                    severity: 'info',
                    rule: 'null_type_low_confidence',
                    message: 'No meaningful relationship found (null type, low confidence)',
                    field: 'relationship_type',
                    current_value: null
                });
            }
        }
    }

    /**
     * Rule 5: Check explanation quality
     */
    private checkExplanationQuality(
        relationship: PaperRelationshipRow,
        issues: ValidationIssue[]
    ): void {
        const explanation = relationship.explanation.trim();

        // Too short
        if (explanation.length < 20) {
            issues.push({
                severity: 'warning',
                rule: 'explanation_too_short',
                message: `Explanation is very short (${explanation.length} chars)`,
                field: 'explanation',
                current_value: explanation,
                suggested_fix: 'Provide more detailed explanation'
            });
        }

        // Empty or placeholder
        if (!explanation || explanation.toLowerCase() === 'not explicitly stated in abstract') {
            issues.push({
                severity: 'warning',
                rule: 'explanation_missing',
                message: 'Explanation is missing or placeholder text',
                field: 'explanation',
                current_value: explanation,
                suggested_fix: 'Extract meaningful explanation from paper content'
            });
        }
    }

    // ========================================================================
    // Summary Statistics
    // ========================================================================

    /**
     * Generate validation summary statistics
     */
    generateSummary(
        entityResults: EntityValidationResult[],
        relationshipResults: RelationshipValidationResult[]
    ): {
        entities: {
            total: number;
            valid: number;
            invalid: number;
            errors: number;
            warnings: number;
        };
        relationships: {
            total: number;
            valid: number;
            invalid: number;
            flagged_for_review: number;
            errors: number;
            warnings: number;
        };
    } {
        return {
            entities: {
                total: entityResults.length,
                valid: entityResults.filter(r => r.is_valid).length,
                invalid: entityResults.filter(r => !r.is_valid).length,
                errors: entityResults.reduce((sum, r) =>
                    sum + r.issues.filter(i => i.severity === 'error').length, 0),
                warnings: entityResults.reduce((sum, r) =>
                    sum + r.issues.filter(i => i.severity === 'warning').length, 0)
            },
            relationships: {
                total: relationshipResults.length,
                valid: relationshipResults.filter(r => r.is_valid).length,
                invalid: relationshipResults.filter(r => !r.is_valid).length,
                flagged_for_review: relationshipResults.filter(r => r.should_flag_for_review).length,
                errors: relationshipResults.reduce((sum, r) =>
                    sum + r.issues.filter(i => i.severity === 'error').length, 0),
                warnings: relationshipResults.reduce((sum, r) =>
                    sum + r.issues.filter(i => i.severity === 'warning').length, 0)
            }
        };
    }
}