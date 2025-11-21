    # Knowledge Graph Agents - Entity Extraction Layer

This is the **TypeScript agent layer** for the Knowledge Graph system. It extracts entities (concepts, methods, techniques, datasets, metrics) from research papers using Anthropic's Claude AI.

## 🏗️ Architecture

```
┌─────────────────┐
│   PostgreSQL    │ ← Papers (with full_text)
│   Database      │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────┐
│   Entity Extraction Agent           │
│   (Claude Sonnet 4)                 │
│                                     │
│   - Reads paper content             │
│   - Extracts concepts/methods       │
│   - Categorizes entities            │
│   - Assigns relevance scores        │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────┐
│   PostgreSQL    │
│   - concepts    │ ← Extracted entities
│   - paper_concepts │ ← Links papers to concepts
│   - extraction_logs │ ← Processing logs
└─────────────────┘
```

## 📋 Prerequisites

- **Node.js**: v18 or higher
- **PostgreSQL**: Database with papers already loaded
- **Anthropic API Key**: Get from https://console.anthropic.com/

## 🚀 Setup Instructions

### Step 1: Install Dependencies

```bash
npm install
```

This will install:
- `@anthropic-ai/sdk` - Claude AI client
- `pg` - PostgreSQL client
- `dotenv` - Environment variable management
- TypeScript and related tools

### Step 2: Configure Environment Variables

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Then edit `.env` with your actual values:

```env
# Database Configuration
DATABASE_URL=postgresql://user:password@localhost:5432/knowledge_graph

# Anthropic API Configuration
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxx

# Agent Configuration
MAX_TOKENS=4096
TEMPERATURE=0.0
MODEL_NAME=claude-sonnet-4-20250514
```

**Important**: Replace with your actual database credentials and Anthropic API key!

### Step 3: Test Connections

Before running the extraction, verify everything is set up correctly:

```bash
npm run test
```

This will test:
- ✅ Database connection
- ✅ Anthropic API connection
- 📊 Show database statistics

**Expected output:**
```
🧪 TESTING KNOWLEDGE GRAPH AGENT SETUP
============================================================
🔍 Testing Database Connection...
✅ Database connected successfully at: 2024-11-18...
📊 Database Stats:
   - Total papers: 20
   - Total concepts: 0
   - Processed papers: 0
============================================================
🔍 Testing Anthropic API Connection...
✅ API Response: Hello, I am ready to extract entities...
============================================================
📋 TEST SUMMARY
Database: ✅ PASS
Anthropic API: ✅ PASS
============================================================
🎉 All tests passed! You are ready to run entity extraction.
```

### Step 4: Run Entity Extraction

Once tests pass, start the extraction pipeline:

```bash
npm run extract
```

This will:
1. Find all unprocessed papers in the database
2. Extract entities from each paper using Claude
3. Store entities in the `concepts` and `paper_concepts` tables
4. Log progress in `extraction_logs` table

**Expected output:**
```
📊 DATABASE STATISTICS
============================================================
Total papers in database: 20
Papers processed: 0
Total concepts extracted: 0
Total paper-concept links: 0
============================================================

📋 Found 20 unprocessed papers

Starting entity extraction in 3 seconds...

🚀 Starting entity extraction for 20 papers

[1/20] Processing paper...
================================================================================
📄 Processing Paper #1: 3D Gaussian Splatting for Real-Time Radiance Field Rendering
================================================================================
📝 Extracting entities from paper: "3D Gaussian Splatting..."
✅ Extracted 25 entities
   ✅ [method] 3D Gaussian Splatting (score: 1.00)
   ✅ [technique] spherical harmonics (score: 0.85)
   ✅ [metric] PSNR (score: 0.70)
   ...

✅ Successfully processed paper #1
   - Entities extracted: 25
   - Entities stored: 25
   - Processing time: 8.45s

⏳ Waiting 2 seconds before next paper...
```

## 🗂️ Project Structure

```
knowledge-graph-agents/
├── src/
│   ├── agents/
│   │   ├── entity-extraction-agent.ts    # Main agent logic
│   │   └── run-entity-extraction.ts       # Pipeline orchestration
│   ├── database.ts                        # Database client
│   ├── types.ts                           # TypeScript types
│   └── test-connection.ts                 # Connection tests
├── dist/                                  # Compiled JavaScript (auto-generated)
├── package.json                           # Dependencies
├── tsconfig.json                          # TypeScript configuration
├── .env                                   # Environment variables (create this!)
└── README.md                              # This file
```

## 🧪 Development

### Build TypeScript

```bash
npm run build
```

Compiles TypeScript to JavaScript in the `dist/` folder.

### Run in Development Mode

```bash
npm run dev
```

Uses `ts-node` to run TypeScript directly without compiling.

## 🔍 How the Entity Extraction Agent Works

1. **Retrieves papers** from the database (papers with `full_text`)

2. **Sends to Claude** with a structured prompt that asks for:
   - Methods (e.g., "3D Gaussian Splatting")
   - Techniques (e.g., "spherical harmonics")
   - Datasets (e.g., "Mip-NeRF 360")
   - Metrics (e.g., "PSNR", "FPS")
   - Concepts (e.g., "real-time rendering")
   - Architectures (e.g., "MLP")

3. **Claude returns JSON** with entities including:
   - Name
   - Type
   - Description
   - Relevance score (0.0-1.0)
   - Context snippet (where in the paper)

4. **Stores in database**:
   - Inserts unique concepts into `concepts` table
   - Links papers to concepts in `paper_concepts` table
   - Increments `mention_count` for duplicate concepts
   - Logs success/failure in `extraction_logs` table

## 📊 Monitoring Progress

### Check Database Stats

```bash
npm run test
```

Shows:
- Total papers
- Papers processed
- Total concepts extracted
- Total paper-concept links

### Query the Database Directly

```sql
-- See extracted concepts
SELECT name, concept_type, mention_count 
FROM concepts 
ORDER BY mention_count DESC 
LIMIT 10;

-- See papers with concept counts
SELECT p.title, COUNT(pc.concept_id) as concept_count
FROM papers p
LEFT JOIN paper_concepts pc ON p.id = pc.paper_id
GROUP BY p.id
ORDER BY concept_count DESC;

-- Check extraction logs
SELECT 
    paper_id, 
    stage, 
    status, 
    processing_time_seconds,
    created_at
FROM extraction_logs
ORDER BY created_at DESC
LIMIT 10;
```

## ⚙️ Configuration Options

### Environment Variables

- `MAX_TOKENS`: Maximum tokens for Claude response (default: 4096)
- `TEMPERATURE`: Claude temperature 0.0-1.0 (default: 0.0 for deterministic)
- `MODEL_NAME`: Claude model to use (default: claude-sonnet-4-20250514)

### Modifying the Extraction Logic

To adjust what entities are extracted, edit:
- **Prompt**: `src/agents/entity-extraction-agent.ts` → `buildExtractionPrompt()`
- **Categories**: `src/types.ts` → `ConceptType` enum

## 🐛 Troubleshooting

### "DATABASE_URL not found"
Create a `.env` file with your database connection string.

### "ANTHROPIC_API_KEY not found"
Add your Anthropic API key to `.env`.

### "No content available for extraction"
Ensure your papers have `full_text` populated in the database.

### "Failed to parse entity response"
Claude's JSON response couldn't be parsed. Check:
- Is the prompt clear?
- Is the paper content too large (truncated to 80k chars)?
- Check logs for the actual response

### Rate Limits
The pipeline waits 2 seconds between papers to avoid rate limits. Adjust in `run-entity-extraction.ts` if needed.

## 📝 Next Steps

After entity extraction completes:

1. ✅ **Verify results**: Check `concepts` and `paper_concepts` tables
2. 🔗 **Relationship Discovery**: Build the Relationship Discovery Agent
3. ✓ **Validation**: Build the Validation Agent
4. 📊 **Analysis**: Query the knowledge graph for insights

## 📖 Assignment Requirements Met

✅ **TypeScript agent layer** (as preferred by assignment)  
✅ **Anthropic Claude integration** (specified API key setup)  
✅ **PostgreSQL storage** (using provided schema)  
✅ **Agentic extraction** (structured prompting with Claude)  
✅ **Logging and error handling** (extraction_logs table)  
✅ **Modularity** (separate agent, database, types files)

-----------------
# Relationship Discovery Agent (Agent #2) - Setup Guide

This is **Agent #2** in your Knowledge Graph system. It discovers semantic relationships between papers and the seminal paper by analyzing abstracts and concept overlap.

## 🏗️ What Agent #2 Does

```
┌─────────────────┐
│   PostgreSQL    │
│   - papers      │
│   - concepts    │ ← Input from Agent #1
│   - paper_concepts │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────┐
│   Relationship Discovery Agent      │
│   (Claude Sonnet 4)                 │
│                                     │
│   For each paper:                   │
│   1. Get concepts from Agent #1     │
│   2. Calculate concept overlap      │
│   3. Analyze abstracts              │
│   4. Determine relationship type    │
│   5. Assign confidence score        │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────┐
│   PostgreSQL    │
│   - paper_relationships │ ← Semantic relationships
│   - extraction_logs     │ ← Processing logs
└─────────────────┘
```

## 📋 Prerequisites

**Before running Agent #2, you must have:**

1. ✅ Agent #1 (Entity Extraction) completed successfully
2. ✅ Database tables populated:
   - `papers` table with abstracts
   - `concepts` table with extracted entities
   - `paper_concepts` table linking papers to concepts
3. ✅ At least one paper marked with `is_seminal = true`
4. ✅ Anthropic API key configured

## 🚀 Setup Instructions

### Step 1: Update Database Client

You need to add new methods to your `database.ts` file to support relationship discovery.

**Option A: Manual Update**

Open `/mnt/project/database.ts` and follow the instructions in `database-extensions.ts`:

1. Replace the existing `getPaperConcepts` method with the new version that includes `minRelevance` parameter
2. Add all the new methods before the `close()` method

**Option B: Quick Reference**

The new methods you need to add are in `database-extensions.ts`. Copy them to your `database.ts` file.

### Step 2: Copy Agent Files

Copy the agent files to your project:

```bash
# From your project root
cp /path/to/relationship-discovery-agent.ts src/agents/
cp /path/to/run-relationship-discovery.ts src/agents/
```

### Step 3: Verify Environment Variables

Your `.env` file should already have:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/knowledge_graph
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxx
MODEL_NAME=claude-sonnet-4-20250514
MAX_TOKENS=4096
TEMPERATURE=0.0
```

### Step 4: Build TypeScript

```bash
npm run build
```

### Step 5: Test Database Extensions

Before running the full pipeline, verify the database methods work:

```bash
# Test that seminal paper can be loaded
npm run test
```

Expected output should show your seminal paper title.

## 🎯 Running Agent #2

### Run Relationship Extraction

```bash
npm run discover
```

Or if you haven't added the npm script yet:

```bash
ts-node src/agents/run-relationship-discovery.ts
```

### What Happens:

1. **Loads seminal paper** - Finds the paper marked with `is_seminal = true`
2. **Finds papers needing processing** - Papers that haven't been processed for relationships yet
3. **For each paper:**
   - Loads concepts from Agent #1
   - Calculates shared concepts with seminal paper
   - Computes base confidence from concept overlap
   - Sends to Claude for relationship analysis
   - Stores relationship in database
   - Logs progress to `extraction_logs`
4. **Shows statistics** - Summary of relationships discovered

### Expected Output:

```
🧪 TESTING KNOWLEDGE GRAPH AGENT SETUP
============================================================
🔍 Testing Database Connection...
✅ Database connected successfully at: 2024-11-18...

🔍 Loading seminal paper...
✅ Seminal paper: "3D Gaussian Splatting for Real-Time Radiance Field Rendering"
   ArXiv ID: 2308.04079

============================================================
📊 DATABASE STATISTICS
============================================================
Total papers in database: 20
Papers with concepts: 20
Total concepts extracted: 485
Total paper-concept links: 432

Total relationships: 0
Average confidence: 0.00
============================================================

📋 Found 19 papers needing relationship extraction

Starting relationship extraction in 3 seconds...

🚀 Starting relationship extraction for 19 papers

[1/19] Processing paper...
================================================================================
📄 Processing Paper #2
   Title: Dynamic 3D Gaussians: Tracking by Persistent Dynamic View Synthesis
================================================================================

📚 Loading concepts...
   Source paper concepts: 24
   Target paper concepts: 28
   Shared concepts (≥0.4 relevance): 8

🤖 Calling Relationship Discovery Agent...
🔍 Analyzing relationship: "Dynamic 3D Gaussians: Tracking..."
   → Target: "3D Gaussian Splatting for Real-Time..."
   Shared concepts: 8
   Base confidence: 0.75
   ✅ Found: extends (confidence: 0.82)

💾 Storing relationship...
   ✅ Stored relationship #1
   Type: extends
   Confidence: 0.82
   Evidence: "We extend 3D Gaussian Splatting to dynamic scenes..."

✅ Successfully processed paper #2 in 8.45s

⏳ Waiting 2 seconds before next paper...

[2/19] Processing paper...
...
```

## 📊 Monitoring Progress

### Check Database Directly

```sql
-- See all relationships
SELECT 
    sp.title as source_paper,
    tp.title as target_paper,
    pr.relationship_type,
    pr.confidence,
    pr.explanation
FROM paper_relationships pr
JOIN papers sp ON pr.source_paper_id = sp.id
JOIN papers tp ON pr.target_paper_id = tp.id
ORDER BY pr.confidence DESC;

-- Count by relationship type
SELECT 
    relationship_type,
    COUNT(*) as count,
    AVG(confidence) as avg_confidence
FROM paper_relationships
GROUP BY relationship_type
ORDER BY count DESC;

-- Check extraction logs
SELECT 
    paper_id, 
    stage, 
    status, 
    processing_time_seconds,
    created_at
FROM extraction_logs
WHERE stage = 'relationship_extraction'
ORDER BY created_at DESC
LIMIT 10;
```

### Query Examples

```sql
-- Find papers that improve the seminal paper
SELECT 
    p.title as improving_paper,
    pr.explanation,
    pr.confidence
FROM paper_relationships pr
JOIN papers p ON pr.source_paper_id = p.id
JOIN papers target ON pr.target_paper_id = target.id
WHERE target.is_seminal = TRUE
  AND pr.relationship_type = 'improves_on'
ORDER BY pr.confidence DESC;

-- Find papers that extend the seminal paper
SELECT 
    p.title,
    pr.explanation
FROM paper_relationships pr
JOIN papers p ON pr.source_paper_id = p.id
WHERE pr.relationship_type = 'extends'
ORDER BY pr.confidence DESC;
```

## ⚙️ Configuration

### Concept Overlap Thresholds

In `run-relationship-discovery.ts`, line ~65:

```typescript
const minRelevance = 0.4; // Only count concepts with relevance ≥ 0.4
```

You can adjust this value:
- `0.4` = Default (as per your specification)
- `0.5` = More strict (higher quality concepts)
- `0.3` = More lenient (include more concepts)

### Confidence Calculation

In `relationship-discovery-agent.ts`, method `calculateBaseConfidence()`:

```typescript
// Current formula:
const score = (highRelevance.length * 0.15) +  // High-relevance concepts
             (mediumRelevance.length * 0.08) +  // Medium-relevance concepts
             (lowRelevance.length * 0.04);      // Low-relevance concepts
```

Adjust the weights to change how concept overlap affects confidence.

### Rate Limiting

In `run-relationship-discovery.ts`, line ~182:

```typescript
await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
```

Adjust delay between API calls if needed.

## 🐛 Troubleshooting

### "No seminal paper found in database"

**Problem:** No paper marked with `is_seminal = true`

**Solution:**
```sql
UPDATE papers 
SET is_seminal = true 
WHERE arxiv_id = '2308.04079';
```

### "Paper has no extracted concepts - skipping"

**Problem:** Agent #1 didn't successfully extract concepts for this paper

**Solution:**
1. Check `extraction_logs` to see if entity extraction succeeded
2. Re-run Agent #1 for that paper: `npm run extract`

### "No concepts found with relevance ≥ 0.4"

**Problem:** All concepts have relevance scores < 0.4

**Solution:**
- Lower the `minRelevance` threshold to 0.3
- Or re-run Agent #1 with adjusted prompts to extract higher-relevance concepts

### "Agent returned invalid or null relationship"

**Problem:** Claude's response couldn't be parsed as valid JSON

**Solution:**
- Check the console output for the actual response
- This is usually a temporary API issue - retry the paper
- If persistent, the prompt may need adjustment

### Rate Limit Errors

**Problem:** `429 Too Many Requests` from Anthropic API

**Solution:**
- Increase delay between papers (currently 2 seconds)
- Wait a few minutes and retry
- Check your API tier limits

## 📈 Performance Expectations

For **20 papers**:
- **Processing time:** ~5-10 minutes total
- **Per paper:** ~15-30 seconds (including 2s delay)
- **API costs:** ~$0.50-1.00 (depending on abstract lengths)
- **Success rate:** Should be 95%+ if Agent #1 succeeded

For **50-100 papers** (future):
- **Processing time:** ~20-50 minutes
- **API costs:** ~$2-5
- **Recommendation:** Run overnight or in batches

## 🎯 What's Next

After Agent #2 completes:

1. ✅ **Verify Results**: Query `paper_relationships` table
2. ✅ **Analyze Confidence Scores**: Check if they make sense
3. ✅ **Build Agent #3**: Validation Agent to verify relationships
4. ✅ **Update Documentation**: Add your findings to the final report

## 🔍 Architecture Notes

### Design Decisions

**Why compare only to seminal paper?**
- Focused scope for POC (19 comparisons vs 380)
- Answers assignment's example query directly
- Clear narrative for documentation
- Easy to extend later

**Why use concept overlap for confidence?**
- Objective, testable metric
- Leverages Agent #1's work
- Scalable (can pre-filter in SQL)
- Explainable to users

**Why abstracts + concepts instead of full text?**
- Token efficient (95% cost savings)
- Faster processing
- Most relationships mentioned in abstracts
- Scales better to 1000+ papers

### Data Flow

```
Agent #1 Output (concepts) 
    ↓
Calculate Shared Concepts (SQL query)
    ↓
Calculate Base Confidence (concept overlap formula)
    ↓
Send to Claude (abstracts + concepts + base confidence)
    ↓
Claude Returns (relationship type + adjusted confidence)
    ↓
Store in Database (paper_relationships table)
    ↓
Log Progress (extraction_logs table)
```

## 📝 Assignment Requirements Met

✅ **TypeScript agent layer** (as preferred)  
✅ **Anthropic Claude integration** (Sonnet 4)  
✅ **PostgreSQL storage** (paper_relationships table)  
✅ **Semantic relationships** (improves_on, extends, evaluates, etc.)  
✅ **Confidence scores** (hybrid approach: concept overlap + LLM)  
✅ **Logging and error handling** (extraction_logs)  
✅ **Modularity** (separate agent, database, pipeline files)  
✅ **Builds on Agent #1** (uses extracted concepts)

## 🎉 Success Criteria

----------------