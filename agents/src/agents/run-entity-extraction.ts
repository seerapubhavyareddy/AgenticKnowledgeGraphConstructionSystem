/**
 * Entity Extraction Pipeline Runner
 * 
 * Processes papers from the database and extracts entities using the Entity Extraction Agent
 */

import * as dotenv from 'dotenv';
import { DatabaseClient } from '../database';
import { EntityExtractionAgent } from './entity-extraction-agent';
import { AgentConfig, PaperRow } from '../types';

// Load environment variables
dotenv.config();

/**
 * Main pipeline orchestrator
 */
class EntityExtractionPipeline {
    private db: DatabaseClient;
    private agent: EntityExtractionAgent;

    constructor(db: DatabaseClient, agent: EntityExtractionAgent) {
        this.db = db;
        this.agent = agent;
    }

    /**
     * Process a single paper
     */
    async processPaper(paper: PaperRow): Promise<boolean> {
        const startTime = Date.now();

        console.log('\n' + '='.repeat(80));
        console.log(`📄 Processing Paper #${paper.id}: ${paper.title}`);
        console.log('='.repeat(80));

        try {
            // Mark as in progress
            await this.db.logExtraction(
                paper.id,
                'entity_extraction',
                'in_progress'
            );

            // Extract entities using the agent
            const entities = await this.agent.extractEntities(
                paper.title,
                paper.abstract,
                paper.full_text
            );

            if (entities.length === 0) {
                console.warn('⚠️  No entities extracted - this might indicate a problem');
            }

            // Store each entity in the database
            let storedCount = 0;
            for (const entity of entities) {
                try {
                    // Insert or update the concept
                    const conceptId = await this.db.upsertConcept(
                        entity.name,
                        entity.type,
                        entity.description
                    );

                    // Link paper to concept
                    await this.db.linkPaperToConcept(
                        paper.id,
                        conceptId,
                        entity.relevance_score,
                        entity.context_snippet
                    );

                    storedCount++;

                    console.log(`   ✅ [${entity.type}] ${entity.name} (score: ${entity.relevance_score.toFixed(2)})`);

                } catch (error) {
                    console.error(`   ❌ Failed to store entity "${entity.name}":`, error);
                }
            }

            // Calculate processing time
            const processingTime = (Date.now() - startTime) / 1000;

            // Log success
            await this.db.logExtraction(
                paper.id,
                'entity_extraction',
                'success',
                null,
                processingTime
            );

            console.log(`\n✅ Successfully processed paper #${paper.id}`);
            console.log(`   - Entities extracted: ${entities.length}`);
            console.log(`   - Entities stored: ${storedCount}`);
            console.log(`   - Processing time: ${processingTime.toFixed(2)}s`);

            return true;

        } catch (error) {
            // Calculate processing time even on failure
            const processingTime = (Date.now() - startTime) / 1000;

            const errorMessage = error instanceof Error ? error.message : String(error);

            // Log failure
            await this.db.logExtraction(
                paper.id,
                'entity_extraction',
                'failed',
                errorMessage,
                processingTime
            );

            console.error(`\n❌ Failed to process paper #${paper.id}:`, errorMessage);

            return false;
        }
    }

    /**
     * Process multiple papers
     */
    async processMultiplePapers(papers: PaperRow[]): Promise<void> {
        console.log(`\n🚀 Starting entity extraction for ${papers.length} papers\n`);

        let successCount = 0;
        let failureCount = 0;

        for (let i = 0; i < papers.length; i++) {
            const paper = papers[i];

            console.log(`\n[${i + 1}/${papers.length}] Processing paper...`);

            const success = await this.processPaper(paper);

            if (success) {
                successCount++;
            } else {
                failureCount++;
            }

            // Add a small delay between papers to avoid rate limits
            if (i < papers.length - 1) {
                console.log('\n⏳ Waiting 2 seconds before next paper...');
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        // Print summary
        console.log('\n' + '='.repeat(80));
        console.log('📊 EXTRACTION SUMMARY');
        console.log('='.repeat(80));
        console.log(`Total papers: ${papers.length}`);
        console.log(`✅ Successful: ${successCount}`);
        console.log(`❌ Failed: ${failureCount}`);
        console.log('='.repeat(80));
    }

    /**
     * Show current database statistics
     */
    async showStats(): Promise<void> {
        const stats = await this.db.getStats();

        console.log('\n' + '='.repeat(80));
        console.log('📊 DATABASE STATISTICS');
        console.log('='.repeat(80));
        console.log(`Total papers in database: ${stats.totalPapers}`);
        console.log(`Papers processed: ${stats.processedPapers}`);
        console.log(`Total concepts extracted: ${stats.totalConcepts}`);
        console.log(`Total paper-concept links: ${stats.totalLinks}`);
        console.log('='.repeat(80));
    }
}

/**
 * Main entry point
 */
async function main() {
    // Load configuration from environment variables
    const databaseUrl = process.env.DATABASE_URL;
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

    if (!databaseUrl) {
        console.error('❌ DATABASE_URL not found in environment variables');
        console.error('Please create a .env file with DATABASE_URL');
        process.exit(1);
    }

    if (!anthropicApiKey) {
        console.error('❌ ANTHROPIC_API_KEY not found in environment variables');
        console.error('Please create a .env file with ANTHROPIC_API_KEY');
        process.exit(1);
    }

    // Create database client
    const db = new DatabaseClient(databaseUrl);

    // Test connection
    const connected = await db.testConnection();
    if (!connected) {
        console.error('❌ Could not connect to database');
        process.exit(1);
    }

    // Create agent configuration
    const agentConfig: AgentConfig = {
        anthropicApiKey,
        modelName: process.env.MODEL_NAME || 'claude-sonnet-4-20250514',
        maxTokens: parseInt(process.env.MAX_TOKENS || '4096'),
        temperature: parseFloat(process.env.TEMPERATURE || '0.0')
    };

    // Create agent
    const agent = new EntityExtractionAgent(agentConfig);

    // Create pipeline
    const pipeline = new EntityExtractionPipeline(db, agent);

    try {
        // Show current stats
        await pipeline.showStats();

        // Get unprocessed papers
        const unprocessedPapers = await db.getUnprocessedPapers();

        if (unprocessedPapers.length === 0) {
            console.log('\n✅ All papers have been processed!');
            console.log('To reprocess papers, delete entries from extraction_logs table.');
            return;
        }

        console.log(`\n📋 Found ${unprocessedPapers.length} unprocessed papers`);

        // Ask user for confirmation (in production, you might auto-proceed)
        console.log('\nStarting entity extraction in 3 seconds...');
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Process all unprocessed papers
        await pipeline.processMultiplePapers(unprocessedPapers);

        // Show final stats
        await pipeline.showStats();

    } catch (error) {
        console.error('\n❌ Pipeline failed:', error);
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