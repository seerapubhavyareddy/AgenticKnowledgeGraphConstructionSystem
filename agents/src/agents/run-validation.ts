/**
 * Validation Pipeline Runner (Agent #3)
 * 
 * Runs rule-based validation on extracted entities and relationships
 */

import * as dotenv from 'dotenv';
import { DatabaseClient } from '../database';
import { ValidationAgent } from './validation-agent';
import { EntityValidationResult, RelationshipValidationResult } from '../types';

// Load environment variables
dotenv.config();

/**
 * Main pipeline orchestrator
 */
class ValidationPipeline {
    private db: DatabaseClient;
    private agent: ValidationAgent;

    constructor(db: DatabaseClient, agent: ValidationAgent) {
        this.db = db;
        this.agent = agent;
    }

    /**
     * Validate all entities (concepts)
     */
    async validateEntities(): Promise<EntityValidationResult[]> {
        console.log('\n' + '='.repeat(80));
        console.log('ðŸ" Validating Entities (Concepts)');
        console.log('='.repeat(80));

        const concepts = await this.db.getAllConceptsWithLinks();
        const results: EntityValidationResult[] = [];

        console.log(`\nFound ${concepts.length} concepts to validate\n`);

        for (let i = 0; i < concepts.length; i++) {
            const concept = concepts[i];

            // Get paper links for this concept
            const paperLinks = await this.db.getPaperConceptLinks(concept.id);

            // Validate the concept
            const result = this.agent.validateConcept(concept, paperLinks);
            results.push(result);

            // Print validation result
            if (!result.is_valid) {
                console.log(`[${i + 1}/${concepts.length}] âŒ INVALID: ${concept.name}`);
                for (const issue of result.issues) {
                    if (issue.severity === 'error') {
                        console.log(`     ðŸ"´ ERROR: ${issue.message}`);
                    }
                }
            } else if (result.issues.length > 0) {
                console.log(`[${i + 1}/${concepts.length}] âš ï¸  WARNING: ${concept.name}`);
                for (const issue of result.issues) {
                    if (issue.severity === 'warning') {
                        console.log(`     ðŸŸ¡ ${issue.message}`);
                    }
                }
            } else {
                console.log(`[${i + 1}/${concepts.length}] âœ… ${concept.name}`);
            }
        }

        return results;
    }

    /**
     * Validate all relationships
     */
    async validateRelationships(): Promise<RelationshipValidationResult[]> {
        console.log('\n' + '='.repeat(80));
        console.log('ðŸ" Validating Relationships');
        console.log('='.repeat(80));

        const relationships = await this.db.getAllRelationships();
        const results: RelationshipValidationResult[] = [];

        console.log(`\nFound ${relationships.length} relationships to validate\n`);

        for (let i = 0; i < relationships.length; i++) {
            const relationship = relationships[i];

            // Validate the relationship
            const result = this.agent.validateRelationship(relationship);
            results.push(result);

            // Update validation status in database
            if (result.is_valid && !result.should_flag_for_review) {
                await this.db.updateRelationshipValidation(relationship.id, true);
            }

            // Print validation result
            const typeStr = relationship.relationship_type || 'null';
            const confStr = relationship.confidence.toFixed(2);

            if (!result.is_valid) {
                console.log(`[${i + 1}/${relationships.length}] âŒ INVALID: ${typeStr} (conf: ${confStr})`);
                console.log(`   Source: ${result.source_paper_title.slice(0, 60)}...`);
                console.log(`   Target: ${result.target_paper_title.slice(0, 60)}...`);
                for (const issue of result.issues) {
                    if (issue.severity === 'error') {
                        console.log(`     ðŸ"´ ERROR: ${issue.message}`);
                    }
                }
            } else if (result.should_flag_for_review) {
                console.log(`[${i + 1}/${relationships.length}] âš ï¸  REVIEW: ${typeStr} (conf: ${confStr})`);
                console.log(`   Source: ${result.source_paper_title.slice(0, 60)}...`);
                for (const issue of result.issues) {
                    if (issue.severity === 'warning') {
                        console.log(`     ðŸŸ¡ ${issue.message}`);
                    }
                }
            } else {
                console.log(`[${i + 1}/${relationships.length}] âœ… ${typeStr} (conf: ${confStr})`);
            }
        }

        return results;
    }

    /**
     * Show validation statistics
     */
    async showStats(): Promise<void> {
        const stats = await this.db.getValidationStats();

        console.log('\n' + '='.repeat(80));
        console.log('ðŸ"Š VALIDATION STATISTICS');
        console.log('='.repeat(80));
        console.log(`\nRelationships:`);
        console.log(`   Total: ${stats.totalRelationships}`);
        console.log(`   Validated: ${stats.validatedRelationships}`);
        console.log(`   Flagged for review: ${stats.flaggedForReview}`);
        console.log(`\nConcepts:`);
        console.log(`   Total: ${stats.totalConcepts}`);
        console.log('='.repeat(80));
    }

    /**
     * Print detailed validation summary
     */
    printSummary(
        entityResults: EntityValidationResult[],
        relationshipResults: RelationshipValidationResult[]
    ): void {
        const summary = this.agent.generateSummary(entityResults, relationshipResults);

        console.log('\n' + '='.repeat(80));
        console.log('ðŸ"‹ VALIDATION SUMMARY');
        console.log('='.repeat(80));

        console.log('\nðŸ"¦ Entities (Concepts):');
        console.log(`   Total validated: ${summary.entities.total}`);
        console.log(`   âœ… Valid: ${summary.entities.valid}`);
        console.log(`   âŒ Invalid: ${summary.entities.invalid}`);
        console.log(`   ðŸ"´ Errors: ${summary.entities.errors}`);
        console.log(`   ðŸŸ¡ Warnings: ${summary.entities.warnings}`);

        console.log('\nðŸ"— Relationships:');
        console.log(`   Total validated: ${summary.relationships.total}`);
        console.log(`   âœ… Valid: ${summary.relationships.valid}`);
        console.log(`   âŒ Invalid: ${summary.relationships.invalid}`);
        console.log(`   âš ï¸  Flagged for review: ${summary.relationships.flagged_for_review}`);
        console.log(`   ðŸ"´ Errors: ${summary.relationships.errors}`);
        console.log(`   ðŸŸ¡ Warnings: ${summary.relationships.warnings}`);

        const entitySuccessRate = (summary.entities.valid / summary.entities.total * 100).toFixed(1);
        const relSuccessRate = (summary.relationships.valid / summary.relationships.total * 100).toFixed(1);

        console.log('\nðŸ"ˆ Success Rates:');
        console.log(`   Entities: ${entitySuccessRate}%`);
        console.log(`   Relationships: ${relSuccessRate}%`);

        console.log('='.repeat(80));
    }

    /**
     * Export validation results to JSON (for documentation)
     */
    async exportResults(
        entityResults: EntityValidationResult[],
        relationshipResults: RelationshipValidationResult[],
        outputPath: string = './outputs/validation-results.json'
    ): Promise<void> {
        const summary = this.agent.generateSummary(entityResults, relationshipResults);

        const exportData = {
            timestamp: new Date().toISOString(),
            summary,
            entity_issues: entityResults
                .filter(r => !r.is_valid || r.issues.length > 0)
                .map(r => ({
                    concept_id: r.concept_id,
                    concept_name: r.concept_name,
                    is_valid: r.is_valid,
                    issues: r.issues
                })),
            relationship_issues: relationshipResults
                .filter(r => !r.is_valid || r.should_flag_for_review)
                .map(r => ({
                    relationship_id: r.relationship_id,
                    type: r.relationship_type,
                    is_valid: r.is_valid,
                    flagged: r.should_flag_for_review,
                    source: r.source_paper_title,
                    target: r.target_paper_title,
                    issues: r.issues
                }))
        };

        const fs = require('fs');
        const path = require('path');

        // Create directory if it doesn't exist
        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2));
        console.log(`\n💾 Validation results exported to: ${outputPath}`);
    }
}

/**
 * Main entry point
 */
async function main() {
    // Load configuration from environment variables
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
        console.error('âŒ DATABASE_URL not found in environment variables');
        console.error('Please create a .env file with DATABASE_URL');
        process.exit(1);
    }

    // Create database client
    const db = new DatabaseClient(databaseUrl);

    // Test connection
    const connected = await db.testConnection();
    if (!connected) {
        console.error('âŒ Could not connect to database');
        process.exit(1);
    }

    // Create validation agent
    const agent = new ValidationAgent();

    // Create pipeline
    const pipeline = new ValidationPipeline(db, agent);

    try {
        // Show current stats
        await pipeline.showStats();

        console.log('\nStarting validation in 3 seconds...');
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Validate entities
        const entityResults = await pipeline.validateEntities();

        // Small delay
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Validate relationships
        const relationshipResults = await pipeline.validateRelationships();

        // Log validation stage completion
        console.log('\nâœ… Validation stage complete');

        // Print summary
        pipeline.printSummary(entityResults, relationshipResults);

        // Export results
        await pipeline.exportResults(entityResults, relationshipResults);

        // Show final stats
        await pipeline.showStats();

    } catch (error) {
        console.error('\nâŒ Validation failed:', error);
        process.exit(1);
    } finally {
        // Clean up
        await db.close();
    }
}

// Run the pipeline
if (require.main === module) {
    main().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}