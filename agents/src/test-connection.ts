/**
 * Test script to verify database and API connections
 */

import * as dotenv from 'dotenv';
import { DatabaseClient } from './database';
import Anthropic from '@anthropic-ai/sdk';

// Load environment variables
dotenv.config();

async function testDatabase() {
    console.log('\n🔍 Testing Database Connection...');
    console.log('='.repeat(60));

    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
        console.error('❌ DATABASE_URL not found in .env file');
        return false;
    }

    try {
        const db = new DatabaseClient(databaseUrl);
        const connected = await db.testConnection();

        if (connected) {
            // Get some stats
            const stats = await db.getStats();
            console.log(`\n📊 Database Stats:`);
            console.log(`   - Total papers: ${stats.totalPapers}`);
            console.log(`   - Total concepts: ${stats.totalConcepts}`);
            console.log(`   - Processed papers: ${stats.processedPapers}`);

            // Get a sample paper
            const papers = await db.getAllPapers();
            if (papers.length > 0) {
                const samplePaper = papers[0];
                console.log(`\n📄 Sample paper:`);
                console.log(`   - ID: ${samplePaper.id}`);
                console.log(`   - Title: ${samplePaper.title}`);
                console.log(`   - ArXiv ID: ${samplePaper.arxiv_id}`);
                console.log(`   - Has full text: ${samplePaper.full_text ? 'Yes' : 'No'}`);
            }

            await db.close();
            return true;
        }

        return false;

    } catch (error) {
        console.error('❌ Database test failed:', error);
        return false;
    }
}

async function testAnthropicAPI() {
    console.log('\n🔍 Testing Anthropic API Connection...');
    console.log('='.repeat(60));

    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
        console.error('❌ ANTHROPIC_API_KEY not found in .env file');
        return false;
    }

    try {
        const client = new Anthropic({ apiKey });

        console.log('📡 Sending test message to Claude...');

        const response = await client.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 100,
            messages: [
                {
                    role: 'user',
                    content: 'Say "Hello, I am ready to extract entities from research papers!" and nothing else.'
                }
            ]
        });

        const responseText = response.content[0].type === 'text'
            ? response.content[0].text
            : '';

        console.log(`✅ API Response: ${responseText}`);

        return true;

    } catch (error) {
        console.error('❌ Anthropic API test failed:', error);
        return false;
    }
}

async function main() {
    console.log('\n' + '='.repeat(60));
    console.log('🧪 TESTING KNOWLEDGE GRAPH AGENT SETUP');
    console.log('='.repeat(60));

    // Test database
    const dbOk = await testDatabase();

    // Test Anthropic API
    const apiOk = await testAnthropicAPI();

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📋 TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`Database: ${dbOk ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Anthropic API: ${apiOk ? '✅ PASS' : '❌ FAIL'}`);
    console.log('='.repeat(60));

    if (dbOk && apiOk) {
        console.log('\n🎉 All tests passed! You are ready to run entity extraction.');
        console.log('\nNext step: npm run extract');
    } else {
        console.log('\n⚠️  Some tests failed. Please check your configuration.');
        process.exit(1);
    }
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});