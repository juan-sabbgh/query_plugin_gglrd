//import express library
const express = require('express');
const mysql = require('mysql2/promise');

// Importa la clase Pool desde la librería 'pg'
const { Pool } = require('pg');

require('dotenv').config();

//create an instance of express
const app = express();
//port on which the server will run
const PORT = 3000;

//URL para llamar al agente
const url = 'https://agents.dyna.ai/openapi/v1/conversation/dialog/';

//agent api parameters
const AGENT_TOKEN = process.env.AGENT_TOKEN;
const AGENT_KEY = process.env.AGENT_KEY;
const AS_ACCOUNT = process.env.AS_ACCOUNT;

//agent api parameters for the coordinator agent
const AGENT_TOKEN_COORD = process.env.AGENT_TOKEN_COORD;
const AGENT_KEY_COORD = process.env.AGENT_KEY_COORD;

//agent api parameters for the director agent
const AGENT_TOKEN_DIRECT = process.env.AGENT_TOKEN_DIRECT;
const AGENT_KEY_DIRECT = process.env.AGENT_KEY_DIRECT;

//agent api parameters for demo
const AGENT_TOKEN_DEMO = process.env.AGENT_TOKEN_DEMO;
const AGENT_KEY_DEMO = process.env.AGENT_KEY_DEMO;

//agent api parameters for the debugging agent
const AGENT_TOKEN_DEBUG = process.env.AGENT_TOKEN_DEBUG;
const AGENT_KEY_DEBUG = process.env.AGENT_KEY_DEBUG;

//agent api parameters for the fixer agent
const AGENT_TOKEN_FIXER = process.env.AGENT_TOKEN_FIXER;
const AGENT_KEY_FIXER = process.env.AGENT_KEY_FIXER;

//agent api parameters for the filter agent
const AGENT_TOKEN_FILTER = process.env.AGENT_TOKEN_FILTER;
const AGENT_KEY_FILTER = process.env.AGENT_KEY_FILTER;

//agent api parameters for the ENHANCER agent
const AGENT_TOKEN_ENHANCER = process.env.AGENT_TOKEN_ENHANCER;
const AGENT_KEY_ENHANCER = process.env.AGENT_KEY_ENHANCER;

//agent api parameters for the SPLITTER agent
const AGENT_TOKEN_SPLITTER = process.env.AGENT_TOKEN_SPLITTER;
const AGENT_KEY_SPLITTER = process.env.AGENT_KEY_SPLITTER;

//database parameters
const DB_HOST = process.env.DB_HOST;
const DB_PORT = process.env.DB_PORT;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_USER = process.env.DB_USER;
const DB_NAME = process.env.DB_NAME;

const dbConfig = {
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    ssl: {
        rejectUnauthorized: false // Requerido para conectar a Supabase
    }
};

// Crea un pool de conexiones usando la configuración
const pool = new Pool(dbConfig);

// Crea un pool de conexiones para manejar las consultas de forma eficiente
//const pool = mysql.createPool(dbConfig);

async function executeQuery(sql) {
    let connection;

    try {
        // 1️⃣ Try the original query
        const results = await pool.query(sql, []);

        // Formatear fechas si existen
        const formattedRows = results.rows.map(row => {
            const formattedRow = { ...row };
            Object.keys(formattedRow).forEach(key => {
                const value = formattedRow[key];
                // Si es una fecha/timestamp
                if (value instanceof Date) {
                    // Convertir a solo fecha
                    const date = new Date(value);
                    formattedRow[key] = date.toISOString().split('T')[0];
                }
                if (key === 'Branch Name' && value && typeof value === 'string') {
                    // Extraer las dos primeras letras en mayúsculas
                    formattedRow[key] = value.substring(0, 2).toUpperCase();
                }
            });
            return formattedRow;
        });

        console.log("✅ SQL OK:", formattedRows);
        return formattedRows;

    } catch (error) {
        console.error("❌ SQL error:", error.message);

        // 2️⃣ Send failing SQL to Debug Agent
        const debugPrompt = `
The following SQL query failed:

${sql}

PostgreSQL error:
${error.message}

Fix the SQL query.
Return ONLY the corrected SQL with no explanation, no markdown.
`;

        let fixedSQL;

        try {
            fixedSQL = await getChatSummaryGeneral(
                AS_ACCOUNT,
                debugPrompt,
                AGENT_KEY_FIXER,
                AGENT_TOKEN_FIXER
            );
        } catch (debugError) {
            console.error("❌ Debug agent failed:", debugError);
            throw error; // rethrow original error
        }

        console.log("🔧 Fixed SQL from debug agent:", fixedSQL);

        // 3️⃣ Try running the corrected SQL
        try {
            const fixedResults = await pool.query(fixedSQL, []);
            console.log("✅ Fixed SQL executed:", fixedResults.rows);
            return fixedResults.rows;
        } catch (fixedError) {
            console.error("❌ Fixed SQL ALSO failed:", fixedError.message);
            throw fixedError; // Fatal
        }

    } finally {
        if (connection) {
            connection.release();
        }
    }
}


async function executeQueryAuth(sql) {
    let connection;
    try {
        // 1️⃣ Try the original query
        const results = await pool.query(sql, []);
        console.log("✅ SQL OK:", results.rows);
        return results.rows;

    } catch (error) {
        console.error("❌ SQL error:", error.message);
        throw error;
    } finally {
        if (connection) {
            connection.release();
        }
    }
}


function generateMarkdownTable(data) {
    if (!data || data.length === 0) {
        return "No data to be shown";
    }

    const headers = Object.keys(data[0]);
    const headerRow = `| ${headers.join(' | ')} |`;
    const separatorRow = `|${headers.map(() => ':---').join('|')}|`;

    const bodyRows = data.map(row => {
        const values = headers.map(header => row[header]);
        return `| ${values.join(' | ')} |`;
    }).join('\n');

    return `${headerRow}\n${separatorRow}\n${bodyRows}`;
}

// Utility function — checks if any cell in the results has more than maxLength characters
function hasLongCellValue(rows, maxLength = 80) {
    return rows.some(row =>
        Object.values(row).some(value =>
            typeof value === 'string' && value.length > maxLength
        )
    );
}

async function getChatSummaryGeneral(as_account, prompt, agent_key, agent_token) {
    try {
        const requestData = {
            username: as_account,
            question: prompt
        };
        //Get response from the agent
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'cybertron-robot-key': agent_key,
                'cybertron-robot-token': agent_token
            },
            body: JSON.stringify(requestData)
        });

        if (!response.ok) {
            throw new Error(`Error en la solicitud: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log(data);
        return data.data.answer;

    } catch (error) {
        console.error('Error getting chat summary:', error);
        throw error;
    }
}

async function getChatSummaryDemo(query, db_result, question) {
    try {
        // Create a more informative prompt including the database results
        const prompt = `Original query: "${query}"
        Database results: ${JSON.stringify(db_result)}
        User's question: ${question}
        
        Give an answer to the user's question and provide a natural language summary and interpretation of these results.`;

        const requestData = {
            username: AS_ACCOUNT,
            question: prompt
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'cybertron-robot-key': AGENT_KEY_DEMO,
                'cybertron-robot-token': AGENT_TOKEN_DEMO
            },
            body: JSON.stringify(requestData)
        });

        if (!response.ok) {
            throw new Error(`Error en la solicitud: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return data.data.answer;

    } catch (error) {
        console.error('Error getting chat summary:', error);
        throw error;
    }
}

async function getChatSummary(query, db_result, user_question) {
    try {
        // Create a more informative prompt including the database results
        const prompt = `User's question: "${user_question}"
        SQL query performed: "${query}"
        Database results: ${JSON.stringify(db_result)}
        
        Give an answer to the user's question and provide a natural language summary and interpretation of these results.`;

        const requestData = {
            username: AS_ACCOUNT,
            question: prompt
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'cybertron-robot-key': AGENT_KEY,
                'cybertron-robot-token': AGENT_TOKEN
            },
            body: JSON.stringify(requestData)
        });

        if (!response.ok) {
            throw new Error(`Error en la solicitud: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return data.data.answer;

    } catch (error) {
        console.error('Error getting chat summary:', error);
        throw error;
    }
}

// Splits a potentially multi-part question into an array of { question, query, is_chart_target } objects.
// Returns a single-element array when the message contains only one question.
// graph: the requested chart type ("bar", "line", "pie", "scatter", "none") — used to decide which
// sub-question's result is best suited for rendering as that chart.
async function splitQuestion(question, query, graph) {
    const prompt = `You are analyzing a sales data request for Grupo Gagliardi, a lubricants and tires distributor in Brazil.

## Database schema (PostgreSQL)

Table "mytable" (sales/invoice data):
- "Invoice Issue Date" (DATE), "Customer Code" (VARCHAR), "Customer Name" (VARCHAR),
  "Customer Classification" (VARCHAR), "Consultant Code" (VARCHAR), "Consultant Name" (VARCHAR),
  "Branch Name" (VARCHAR), "Item Number" (VARCHAR), "Item Description" (VARCHAR),
  "Quantity" (INTEGER), "Volume" (NUMERIC), "Unit Price" (NUMERIC),
  "Line Total" (NUMERIC), "Document Total" (NUMERIC), "Distributor" (VARCHAR), "Coordinator" (VARCHAR)

Table "smart_swap_clients" (client & inactivity data):
- "customer_code" (VARCHAR), "customer_name" (VARCHAR), "client_segment" (VARCHAR),
  "consultant_name" (VARCHAR), "days_inactive" (INTEGER), "tank_product_code" (VARCHAR),
  "tank_product_name" (VARCHAR), "tank_capacity_liters" (INTEGER)

Table "product_recommendations" (product catalog per segment):
- "client_segment" (VARCHAR), "product_code" (VARCHAR), "recommended_product_name" (VARCHAR), "product_lob" (VARCHAR)

## SQL rules
- ALL column names MUST be enclosed in double quotes (e.g. "Item Description", "Invoice Issue Date")
- Only SELECT statements are allowed
- Default to LIMIT 10 unless the question specifies a different number
- Use ILIKE '%term%' for text search on names and descriptions
- Brand detection via "Item Description": Mobil → ILIKE '%Mobil%', Tirreno → ILIKE '%Tirreno%', Pirelli → ILIKE '%Pirelli%', Arla → ILIKE '%Arla%'

## Date rules
The database contains data only up to September 2025. All relative date references must be interpreted relative to September 2025, not today:
- "últimos 6 meses" → April 2025 – September 2025
- "este mês" → September 2025
- "este ano" → January 2025 – September 2025
- "último trimestre" → July–September 2025
- "mês passado" → August 2025

## Task

User's message: "${question}"
SQL query already generated for this message: "${query}"
Requested chart type: "${graph}"

Analyze if the user's message contains multiple independent data requests.

- If it contains ONLY ONE request: return a single-element array, reusing the provided SQL query unchanged.
- If it contains MULTIPLE independent requests: split them and generate a valid PostgreSQL SELECT query for each one. For the sub-question that is best covered by the provided SQL, reuse it unchanged — do not regenerate it.

## is_chart_target rules (mark true on AT MOST ONE object)
- "bar": suitable when the result has multiple rows, first column is a category/name, remaining columns are numeric (e.g. top clients by revenue, products by volume)
- "line": suitable when the result is a time series (first column is a date or period, remaining columns are numeric metrics)
- "pie": suitable for proportional breakdowns with 2–6 categories
- "none": set is_chart_target to false on ALL objects
- If the sub-question's result would be a single scalar value (one row, one column), it is NOT suitable — do not mark it as chart target
- Mark is_chart_target true on the sub-question whose result set is most suitable for a "${graph}" chart. If no sub-question is suitable, set all to false.

Return ONLY a valid JSON array — no explanation, no markdown:
[
  { "question": "sub-question in Portuguese", "query": "SELECT ...", "is_chart_target": true },
  { "question": "sub-question in Portuguese", "query": "SELECT ...", "is_chart_target": false }
]`;

    const raw = await getChatSummaryGeneral(AS_ACCOUNT, prompt, AGENT_KEY_SPLITTER, AGENT_TOKEN_SPLITTER);
    const cleaned = raw.replace(/```[a-zA-Z]*\n?/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned);
}

// Utility function — place this outside the endpoint
function capFloatsToTwoDecimals(rows) {
    return rows.map(row => {
        const newRow = {};
        for (const [key, value] of Object.entries(row)) {
            newRow[key] = typeof value === 'number' && !Number.isInteger(value)
                ? Math.round(value * 100) / 100
                : value;
        }
        return newRow;
    });
}

app.use(express.json());

app.post('/api/get_recommendation', async (req, res) => {
    const forbiddenPattern = /\b(DROP|INSERT|UPDATE|DELETE|TRUNCATE|ALTER|CREATE|GRANT|REVOKE)\b/i;
    let originalQuery = '';

    try {
        const { graph, question, function_call_username } = req.body;
        let { query } = req.body;
        originalQuery = query;

        console.log(req.body);
        console.log(`Query: ${query} \nGraph: ${graph} \nQuestion: ${question}`);

        // Input validation
        if (!query || typeof query !== 'string' || query.trim().length === 0) {
            return res.json({
                raw: { success: false, original_query: query, error: "Invalid or empty query provided.", result: "The query was not processed successfully" },
                markdown: "The query is invalid. Please try another question.",
                type: "markdown",
                desc: "Please try another question"
            });
        }

        if (forbiddenPattern.test(query)) {
            return res.status(403).json({
                raw: { success: false, original_query: query, error: "Query type not allowed. Only SELECT statements are permitted.", result: "The query was not processed successfully" },
                markdown: "### 🚫 Query Blocked\nYour query was blocked because it is not a `SELECT` statement. Operations like `INSERT`, `UPDATE`, `DROP`, etc., are not allowed.",
                type: "markdown",
                desc: "Only SELECT queries are allowed"
            });
        }

        // Get consultant name
        const query_get_name = await executeQueryAuth(`SELECT name FROM consultants WHERE username = '${function_call_username}';`);
        const consultantName = query_get_name[0].name;
        console.log('Consultant:', consultantName);

        // Step 1: Split message into sub-questions (returns [{question, query, is_chart_target}])
        const subQuestions = await splitQuestion(question, query, graph);
        const isMultiple = subQuestions.length > 1;
        console.log(`Sub-questions (${subQuestions.length}):`, subQuestions.map(s => s.question));

        // Step 2: Filter + execute each sub-question in parallel
        const subResults = await Promise.all(
            subQuestions.map(async ({ question: subQ, query: subSql, is_chart_target }) => {
                const prompt_filter = `What the user asked = ${subQ}
        Draft SQL Query = ${subSql}
        User credential = ${JSON.stringify(consultantName)} - Consultant`;

                let filteredQuery = await getChatSummaryGeneral(AS_ACCOUNT, prompt_filter, AGENT_KEY_FILTER, AGENT_TOKEN_FILTER);
                filteredQuery = filteredQuery.replace(/```[a-zA-Z]*\n?/g, '').replace(/```/g, '').trim();
                console.log(`Filtered query for "${subQ}":`, filteredQuery);

                if (forbiddenPattern.test(filteredQuery)) {
                    console.warn(`Blocked query for sub-question: "${subQ}"`);
                    return { question: subQ, query: filteredQuery, results: [], blocked: true, is_chart_target };
                }

                let results = await executeQuery(filteredQuery);

                if (results && results.length > 0) {
                    results = capFloatsToTwoDecimals(results);
                    if (results.length > 100) {
                        console.log(`Trimming results for "${subQ}" from ${results.length} to 100`);
                        results = results.slice(0, 100);
                    }
                }

                return { question: subQ, query: filteredQuery, results: results || [], is_chart_target };
            })
        );

        // Step 3: Handle case where all sub-queries returned no data
        const hasAnyResults = subResults.some(sr => sr.results.length > 0);
        if (!hasAnyResults) {
            const prompt_debug = `SQL queries performed: ${subResults.map(sr => sr.query).join(' | ')} \nThis was done by a consultant. Give a personalized answer, the results were filtered by their consultant code.`;
            const response_debug = await getChatSummaryGeneral(AS_ACCOUNT, prompt_debug, AGENT_KEY_DEBUG, AGENT_TOKEN_DEBUG);
            return res.json({ markdown: "...", type: "markdown", desc: response_debug });
        }

        // Step 4: Build summary prompt and call analysis agent
        let chat_summary_prefix = "";

        const nonEmptyResults = subResults.filter(sr => sr.results.length > 0);

        // Note if some sub-queries had large result sets (already trimmed above)
        subResults.forEach(sr => {
            if (sr.results.length === 100) {
                chat_summary_prefix += `\n**Nota:** Apenas os primeiros 100 registros foram analisados para "${sr.question}".\n\n`;
            }
        });

        let promptForSummary;
        if (isMultiple) {
            promptForSummary = `User's original message: "${question}"\n\n` +
                nonEmptyResults.map((sr, i) =>
                    `Question ${i + 1}: "${sr.question}"\nSQL: "${sr.query}"\nResults: ${JSON.stringify(sr.results)}`
                ).join('\n\n') +
                '\n\nGive a comprehensive answer addressing all questions with a natural language interpretation of the results.';
        } else {
            promptForSummary = `User's question: "${question}"
        SQL query performed: "${nonEmptyResults[0].query}"
        Database results: ${JSON.stringify(nonEmptyResults[0].results)}

        Give an answer to the user's question and provide a natural language summary and interpretation of these results.`;
        }

        const chat_summary = await getChatSummaryGeneral(AS_ACCOUNT, promptForSummary, AGENT_KEY, AGENT_TOKEN);
        const chat_summary_final = chat_summary_prefix + chat_summary;

        // Step 5: Build response
        if (isMultiple) {
            // Find the sub-result designated for charting (if any and if it has usable data)
            const chartTarget = nonEmptyResults.find(sr =>
                sr.is_chart_target &&
                sr.results.length > 0 &&
                !hasLongCellValue(sr.results) &&
                !(sr.results.length === 1 && Object.keys(sr.results[0]).length === 1) // not a scalar
            );

            if (graph !== "none" && chartTarget && ["bar", "line", "pie"].includes(graph)) {
                const field_headers = Object.keys(chartTarget.results[0]);
                const dimension = field_headers[0];
                const chartResponse = {
                    data: chartTarget.results,
                    raw: nonEmptyResults.map(sr => ({ question: sr.question, result_count: sr.results.length, results: sr.results })),
                    markdown: generateMarkdownTable(chartTarget.results),
                    field_headers,
                    chart_type: graph,
                    type: "chart",
                    dimension,
                    desc: chat_summary_final
                };
                if (graph === "pie") {
                    chartResponse.metrics = field_headers.length > 1 ? field_headers[1] : null;
                }
                return res.json(chartResponse);
            }

            // No suitable chart target — return markdown
            return res.json({
                raw: nonEmptyResults.map(sr => ({ question: sr.question, result_count: sr.results.length, results: sr.results })),
                markdown: "...",
                type: "markdown",
                desc: chat_summary_final
            });
        }

        // Single sub-question: existing chart / markdown logic
        const results = nonEmptyResults[0].results;
        const finalQuery = nonEmptyResults[0].query;
        const longCellDetected = hasLongCellValue(results);
        const isSingleScalar = results.length === 1 && Object.keys(results[0]).length === 1;

        if (graph === "bar") {
            const field_headers = Object.keys(results[0]);
            const dimension = field_headers[0];

            if (longCellDetected || isSingleScalar) {
                return res.json({ markdown: "...", type: "markdown", desc: chat_summary_final });
            }

            return res.json({
                data: results, raw: results,
                markdown: generateMarkdownTable(results),
                field_headers, chart_type: "bar", type: "chart",
                dimension, desc: chat_summary_final
            });
        } else if (graph === "line") {
            const field_headers = Object.keys(results[0]);
            const dimension = field_headers[0];

            if (longCellDetected || isSingleScalar) {
                return res.json({ markdown: "...", type: "markdown", desc: chat_summary_final });
            }

            return res.json({
                data: results, raw: results,
                markdown: generateMarkdownTable(results),
                field_headers, chart_type: "line", type: "chart",
                dimension, desc: chat_summary_final
            });
        } else if (graph === "pie") {
            const field_headers = Object.keys(results[0]);
            const dimension = field_headers[0];
            const metrics = field_headers.length > 1 ? field_headers[1] : null;

            if (longCellDetected || isSingleScalar) {
                return res.json({ markdown: "...", type: "markdown", desc: chat_summary_final });
            }

            return res.json({
                data: results, raw: results,
                markdown: generateMarkdownTable(results),
                field_headers, chart_type: "pie", type: "chart",
                dimension, metrics, desc: chat_summary_final
            });
        }

        if (longCellDetected) {
            return res.json({
                raw: { success: true, original_query: finalQuery, result_count: results.length, result: "The query was processed successfully" },
                markdown: "...", type: "markdown", desc: chat_summary_final
            });
        }

        return res.json({
            raw: { success: true, original_query: finalQuery, result_count: results.length, result: "The query was processed successfully" },
            markdown: "...", type: "markdown", desc: chat_summary_final
        });

    } catch (error) {
        console.error('Error in /api/get_recommendation:', error);

        if (error.message.includes('convert query to SQL')) {
            return res.json({
                raw: { success: false, original_query: originalQuery, error: error, result: "The query was not processed successfully" },
                markdown: "...", type: "markdown", desc: "Por favor, tente outra pergunta"
            });
        } else if (error.message.includes('SQL syntax')) {
            return res.json({
                raw: { success: false, original_query: originalQuery, error: error, result: "There was an issue with the generated query" },
                markdown: "...", type: "markdown", desc: "Houve um problema com a consulta gerada"
            });
        } else {
            return res.json({
                raw: { success: false, original_query: originalQuery, error: error, result: "Something went wrong while processing your request" },
                markdown: "...", type: "markdown", desc: "Algo deu errado ao processar sua solicitação"
            });
        }
    }
});

app.post('/api/get_recommendation_coordinator', async (req, res) => {
    try {
        const { graph, question, function_call_username } = req.body;
        let { query } = req.body;
        //console.log(req.body);
        console.log(`Query: ${query} \nGraph: ${graph} \nQuestion ${question}`)

        // Input validation
        if (!query || typeof query !== 'string' || query.trim().length === 0) {
            return res.json({
                raw: {
                    success: false,
                    original_query: query,
                    error: "Invalid or empty query provided.",
                    result: "The query was not processed successfully"
                },
                markdown: "The query is invalid. Please try another question.",
                type: "markdown",
                desc: "Please try another question"
            });
        }

        console.log('Received query:', query);

        //Validate query, check if it doesnt include queries that can change the structure of the table
        const forbiddenPattern = /\b(DROP|INSERT|UPDATE|DELETE|TRUNCATE|ALTER|CREATE|GRANT|REVOKE)\b/i;

        if (forbiddenPattern.test(query)) {
            console.log('Validation failed: Non-SELECT query detected.');
            return res.status(403).json({
                raw: {
                    success: false,
                    original_query: query,
                    error: "Query type not allowed. Only SELECT statements are permitted.",
                    result: "The query was not processed successfully"
                },
                markdown: "### 🚫 Query Blocked\nYour query was blocked because it is not a `SELECT` statement. Operations like `INSERT`, `UPDATE`, `DROP`, etc., are not allowed.",
                type: "markdown",
                desc: "Only SELECT queries are allowed"
            });
        }

        //get name of the user
        const query_get_name = await executeQueryAuth(`SELECT name FROM coordinators WHERE username = '${function_call_username}';`);
        console.log(query_get_name)

        //Ensure query is filtered correctly
        const prompt_filter = `Query = ${query}
        Name = ${JSON.stringify(query_get_name[0].name)}
        Hierarchy = Coordinator`
        query = await getChatSummaryGeneral(AS_ACCOUNT, prompt_filter, AGENT_KEY_FILTER, AGENT_TOKEN_FILTER);

        console.log(`New Query: ${query}`)

        // Step 2: Execute the SQL query
        let results = await executeQuery(query);
        console.log('Query results:', results);

        if (!results || results.length === 0) {
            //prepare prompt for the debug agent
            prompt_debug = `SQL query: ${query} \n This query was done by a coordinator. Give a personalized answer, the results were filtered by their coordinator name`
            response_debug = await getChatSummaryGeneral(AS_ACCOUNT, prompt_debug, AGENT_KEY_DEBUG, AGENT_TOKEN_DEBUG)
            return res.json({
                markdown: "...",
                type: "markdown",
                //query debugging agent response
                desc: response_debug
            });
        }
        let chat_summary_new = "";
        if (results.length > 100) {
            console.log("Cut results for only 100 rows");
            chat_summary_new = chat_summary_new + "\n**Nota:** Apenas os primeiros 100 registros foram analisados de um total de " + results.length + ".\n\n";
            results = results.slice(0, 100);
        }
        // Step 3: Get AI interpretation of the results
        prompt_results = `User's question: "${question}"
        SQL query performed: "${query}"
        Database results: ${JSON.stringify(results)}
        
        Give an answer to the user's question and provide a natural language summary and interpretation of these results.`;
        const chat_summary = await getChatSummaryGeneral(AS_ACCOUNT, prompt_results, AGENT_KEY_COORD, AGENT_TOKEN_COORD);

        //chat_summary_new = chat_summary.replace(/\$/g, " $ ");
        chat_summary_new = chat_summary_new + chat_summary
        console.log(chat_summary_new);


        //Check wether a graph is necessary
        // Verifica si se necesita un gráfico
        if (graph === "bar") {
            // 1. Get headers of the results
            const field_headers = Object.keys(results[0]);

            // 2. Get dimension
            const dimension = field_headers[0];

            // 3.Generate markdown table
            const markdownTable = generateMarkdownTable(results);

            // 4. Send response
            return res.json({
                data: results,
                raw: results,
                markdown: markdownTable,
                field_headers: field_headers,
                chart_type: "bar",
                type: "chart",
                dimension: dimension,
                desc: chat_summary_new
            });
        }
        else if (graph === "line") {
            const field_headers = Object.keys(results[0]);
            const dimension = field_headers[0];
            const markdownTable = generateMarkdownTable(results);

            return res.json({
                data: results,
                raw: results,
                markdown: markdownTable,
                field_headers: field_headers,
                chart_type: "line",
                type: "chart",
                dimension: dimension,
                desc: chat_summary_new
            });
        }
        else if (graph === "pie") {
            const field_headers = Object.keys(results[0]);

            // Para un Pie Chart, la dimensión son las categorías (primera columna)
            const dimension = field_headers[0];

            // La métrica es el valor numérico (segunda columna) que define el tamaño de las rebanadas.
            // Nos aseguramos de que haya al menos 2 columnas para evitar errores.
            const metrics = field_headers.length > 1 ? field_headers[1] : null;

            const markdownTable = generateMarkdownTable(results);

            // Se construye la respuesta incluyendo el nuevo campo "metrics"
            return res.json({
                data: results,
                raw: results,
                markdown: markdownTable,
                field_headers: field_headers,
                chart_type: "pie",
                type: "chart",
                dimension: dimension,
                metrics: metrics, // <-- CAMBIO CLAVE: Se añade el campo "metrics"
                desc: chat_summary_new
            });
        }

        // Step 4: Return the response
        const markdownTable = generateMarkdownTable(results);
        return res.json({
            raw: {
                success: true,
                original_query: query,
                result_count: results.length,
                result: "The query was processed successfully"
            },
            markdown: markdownTable,
            type: "markdown",
            desc: chat_summary_new
        });

    } catch (error) {
        console.error('Error in /api/get_recommendation:', error);

        // Provide helpful error messages based on the type of error
        if (error.message.includes('convert query to SQL')) {
            return res.json({
                raw: {
                    success: false,
                    original_query: query,
                    error: error,
                    result: "The query was not processed successfully"
                },
                markdown: "...",
                type: "markdown",
                desc: "Por favor, tente outra pergunta"
            });
        } else if (error.message.includes('SQL syntax')) {
            return res.json({
                raw: {
                    success: false,
                    original_query: query,
                    error: error,
                    result: "There was an issue with the generated query"
                },
                markdown: "...",
                type: "markdown",
                desc: "Houve um problema com a consulta gerada"
            });
        } else {
            return res.json({
                raw: {
                    success: false,
                    original_query: query,
                    error: error,
                    result: "Something went wrong while processing your request"
                },
                markdown: "...",
                type: "markdown",
                desc: "Algo deu errado ao processar sua solicitação"
            });
        }
    }
});

app.post('/api/get_recommendation_director', async (req, res) => {
    try {
        const { query, graph, question } = req.body;

        console.log(`Query: ${query} \nGraph: ${graph} \nQuestion ${question}`)

        // Input validation
        if (!query || typeof query !== 'string' || query.trim().length === 0) {
            return res.json({
                raw: {
                    success: false,
                    original_query: query,
                    error: "Invalid or empty query provided.",
                    result: "The query was not processed successfully"
                },
                markdown: "The query is invalid. Please try another question.",
                type: "markdown",
                desc: "Please try another question"
            });
        }

        //ENHANCE SQL QUERY AND REMOVE ```SQL  ``` FROM THE QUERY GENERATED
        const prompt_enhancer = `Query: ${query}
        Question: ${question}`;
        let enhanced_query = query;
        enhanced_query = await getChatSummaryGeneral(AS_ACCOUNT, prompt_enhancer, AGENT_KEY_ENHANCER, AGENT_TOKEN_ENHANCER);
        enhanced_query = enhanced_query.replace(/^```sql\s*/i, '').replace(/\s*```$/g, '').trim();

        console.log('Enhanced query:', enhanced_query);

        //Validate query, check if it doesnt include queries that can change the structure of the table
        const forbiddenPattern = /\b(DROP|INSERT|UPDATE|DELETE|TRUNCATE|ALTER|CREATE|GRANT|REVOKE)\b/i;

        if (forbiddenPattern.test(enhanced_query)) {
            console.log('Validation failed: Non-SELECT query detected.');
            return res.status(403).json({
                raw: {
                    success: false,
                    original_query: enhanced_query,
                    error: "Query type not allowed. Only SELECT statements are permitted.",
                    result: "The query was not processed successfully"
                },
                markdown: "### 🚫 Query Blocked\nYour query was blocked because it is not a `SELECT` statement. Operations like `INSERT`, `UPDATE`, `DROP`, etc., are not allowed.",
                type: "markdown",
                desc: "Only SELECT queries are allowed"
            });
        }

        // Step 2: Execute the SQL query
        let results = await executeQuery(enhanced_query);
        console.log('Query results:', results);

        if (!results || results.length === 0) {
            //prepare prompt for the debug agent
            prompt_debug = `SQL query: ${enhanced_query} \n This query was done by a director. Give a personalized answer`
            response_debug = await getChatSummaryGeneral(AS_ACCOUNT, prompt_debug, AGENT_KEY_DEBUG, AGENT_TOKEN_DEBUG)
            return res.json({
                markdown: "...",
                type: "markdown",
                //query debugging agent response
                desc: response_debug
            });
        }
        let chat_summary_new = "";
        if (results.length > 100) {
            console.log("Cut results for only 100 rows");
            chat_summary_new = chat_summary_new + "\n**Nota:** Apenas os primeiros 100 registros foram analisados de um total de " + results.length + ".\n\n";
            results = results.slice(0, 100);
        }
        // Step 3: Get AI interpretation of the results
        prompt_results = `User's question: "${question}"
        SQL query performed: "${enhanced_query}"
        Database results: ${JSON.stringify(results)}

        Give an answer to the user's question and provide a natural language summary and interpretation of these results.`;
        const chat_summary = await getChatSummaryGeneral(AS_ACCOUNT, prompt_results, AGENT_KEY_DIRECT, AGENT_TOKEN_DIRECT);

        //chat_summary_new = chat_summary.replace(/\$/g, "$");
        chat_summary_new = chat_summary_new + chat_summary

        console.log(chat_summary_new);


        //Check wether a graph is necessary
        // Verifica si se necesita un gráfico
        if (graph === "bar") {
            // 1. Get headers of the results
            const field_headers = Object.keys(results[0]);

            // 2. Get dimension
            const dimension = field_headers[0];

            // 3.Generate markdown table
            const markdownTable = generateMarkdownTable(results);

            // 4. Send response
            return res.json({
                data: results,
                raw: results,
                markdown: markdownTable,
                field_headers: field_headers,
                chart_type: "bar",
                type: "chart",
                dimension: dimension,
                desc: chat_summary_new
            });
        }
        else if (graph === "line") {
            const field_headers = Object.keys(results[0]);
            const dimension = field_headers[0];
            const markdownTable = generateMarkdownTable(results);

            return res.json({
                data: results,
                raw: results,
                markdown: markdownTable,
                field_headers: field_headers,
                chart_type: "line",
                type: "chart",
                dimension: dimension,
                desc: chat_summary_new
            });
        }
        else if (graph === "pie") {
            const field_headers = Object.keys(results[0]);

            // Para un Pie Chart, la dimensión son las categorías (primera columna)
            const dimension = field_headers[0];

            // La métrica es el valor numérico (segunda columna) que define el tamaño de las rebanadas.
            // Nos aseguramos de que haya al menos 2 columnas para evitar errores.
            const metrics = field_headers.length > 1 ? field_headers[1] : null;

            const markdownTable = generateMarkdownTable(results);

            // Se construye la respuesta incluyendo el nuevo campo "metrics"
            return res.json({
                data: results,
                raw: results,
                markdown: markdownTable,
                field_headers: field_headers,
                chart_type: "pie",
                type: "chart",
                dimension: dimension,
                metrics: metrics, // <-- CAMBIO CLAVE: Se añade el campo "metrics"
                desc: chat_summary_new
            });
        }

        // Step 4: Return the response
        const markdownTable = generateMarkdownTable(results);
        return res.json({
            raw: {
                success: true,
                original_query: enhanced_query,
                result_count: results.length,
                result: "The query was processed successfully"
            },
            markdown: markdownTable,
            type: "markdown",
            desc: chat_summary_new
        });

    } catch (error) {
        console.error('Error in /api/get_recommendation:', error);

        // Provide helpful error messages based on the type of error
        if (error.message.includes('convert query to SQL')) {
            return res.json({
                raw: {
                    success: false,
                    original_query: enhanced_query,
                    error: error,
                    result: "The query was not processed successfully"
                },
                markdown: "...",
                type: "markdown",
                desc: "Por favor, tente outra pergunta"
            });
        } else if (error.message.includes('SQL syntax')) {
            return res.json({
                raw: {
                    success: false,
                    original_query: enhanced_query,
                    error: error,
                    result: "There was an issue with the generated query"
                },
                markdown: "...",
                type: "markdown",
                desc: "Houve um problema com a consulta gerada"
            });
        } else {
            return res.json({
                raw: {
                    success: false,
                    original_query: enhanced_query,
                    error: error,
                    result: "Something went wrong while processing your request"
                },
                markdown: "...",
                type: "markdown",
                desc: "Algo deu errado ao processar sua solicitação"
            });
        }
    }
});

app.post('/api/get_recommendation_demo', async (req, res) => {
    try {
        const { query, graph, question } = req.body;

        console.log(`Query: ${query} \nGraph: ${graph} \nQuestion ${question}`)

        // Input validation
        if (!query || typeof query !== 'string' || query.trim().length === 0) {
            return res.json({
                raw: {
                    success: false,
                    original_query: query,
                    error: "Invalid or empty query provided.",
                    result: "The query was not processed successfully"
                },
                markdown: "The query is invalid. Please try another question.",
                type: "markdown",
                desc: "Please try another question"
            });
        }

        console.log('Received query:', query);

        //Validate query, check if it doesnt include queries that can change the structure of the table
        const forbiddenPattern = /\b(DROP|INSERT|UPDATE|DELETE|TRUNCATE|ALTER|CREATE|GRANT|REVOKE)\b/i;

        if (forbiddenPattern.test(query)) {
            console.log('Validation failed: Non-SELECT query detected.');
            return res.status(403).json({
                raw: {
                    success: false,
                    original_query: query,
                    error: "Query type not allowed. Only SELECT statements are permitted.",
                    result: "The query was not processed successfully"
                },
                markdown: "### 🚫 Query Blocked\nYour query was blocked because it is not a `SELECT` statement. Operations like `INSERT`, `UPDATE`, `DROP`, etc., are not allowed.",
                type: "markdown",
                desc: "Only SELECT queries are allowed"
            });
        }

        // Step 2: Execute the SQL query
        let results = await executeQuery(query);
        console.log('Query results:', results);

        if (!results || results.length === 0) {
            //prepare prompt for the debug agent
            prompt_debug = `SQL query: ${query} \n This query was done by a director. Give a personalized answer`
            response_debug = await getChatSummaryGeneral(AS_ACCOUNT, prompt_debug, AGENT_KEY_DEBUG, AGENT_TOKEN_DEBUG)
            return res.json({
                markdown: "...",
                type: "markdown",
                //query debugging agent response
                desc: response_debug
            });
        }
        let chat_summary_new = "";
        if (results.length > 100) {
            console.log("Cut results for only 100 rows");
            chat_summary_new = chat_summary_new + "\n**Note:** Only the first 100 records were analyzed out of a total of " + results.length + ".\n\n";
            results = results.slice(0, 100);
        }
        // Step 3: Get AI interpretation of the results
        prompt_results = `User's question: "${question}"
        SQL query performed: "${query}"
        Database results: ${JSON.stringify(results)}

        Give an answer to the user's question and provide a natural language summary and interpretation of these results.`;
        const chat_summary = await getChatSummaryDemo(query, results, question);

        //chat_summary_new = chat_summary.replace(/\$/g, "$");
        chat_summary_new = chat_summary_new + chat_summary

        console.log(chat_summary_new);


        //Check wether a graph is necessary
        // Verifica si se necesita un gráfico
        if (graph === "bar") {
            // 1. Get headers of the results
            const field_headers = Object.keys(results[0]);

            // 2. Get dimension
            const dimension = field_headers[0];

            // 3.Generate markdown table
            const markdownTable = generateMarkdownTable(results);

            // 4. Send response
            return res.json({
                data: results,
                raw: results,
                markdown: markdownTable,
                field_headers: field_headers,
                chart_type: "bar",
                type: "chart",
                dimension: dimension,
                desc: chat_summary_new
            });
        }
        else if (graph === "line") {
            const field_headers = Object.keys(results[0]);
            const dimension = field_headers[0];
            const markdownTable = generateMarkdownTable(results);

            return res.json({
                data: results,
                raw: results,
                markdown: markdownTable,
                field_headers: field_headers,
                chart_type: "line",
                type: "chart",
                dimension: dimension,
                desc: chat_summary_new
            });
        }
        else if (graph === "pie") {
            const field_headers = Object.keys(results[0]);

            // Para un Pie Chart, la dimensión son las categorías (primera columna)
            const dimension = field_headers[0];

            // La métrica es el valor numérico (segunda columna) que define el tamaño de las rebanadas.
            // Nos aseguramos de que haya al menos 2 columnas para evitar errores.
            const metrics = field_headers.length > 1 ? field_headers[1] : null;

            const markdownTable = generateMarkdownTable(results);

            // Se construye la respuesta incluyendo el nuevo campo "metrics"
            return res.json({
                data: results,
                raw: results,
                markdown: markdownTable,
                field_headers: field_headers,
                chart_type: "pie",
                type: "chart",
                dimension: dimension,
                metrics: metrics, // <-- CAMBIO CLAVE: Se añade el campo "metrics"
                desc: chat_summary_new
            });
        }

        // Step 4: Return the response
        const markdownTable = generateMarkdownTable(results);
        return res.json({
            raw: {
                success: true,
                original_query: query,
                result_count: results.length,
                result: "The query was processed successfully"
            },
            markdown: markdownTable,
            type: "markdown",
            desc: chat_summary_new
        });

    } catch (error) {
        console.error('Error in /api/get_recommendation:', error);

        // Provide helpful error messages based on the type of error
        if (error.message.includes('convert query to SQL')) {
            return res.json({
                raw: {
                    success: false,
                    original_query: query,
                    error: error,
                    result: "The query was not processed successfully"
                },
                markdown: "...",
                type: "markdown",
                desc: "The query was not processed successfully"
            });
        } else if (error.message.includes('SQL syntax')) {
            return res.json({
                raw: {
                    success: false,
                    original_query: query,
                    error: error,
                    result: "There was an issue with the generated query"
                },
                markdown: "...",
                type: "markdown",
                desc: "There was an issue with the generated query"
            });
        } else {
            return res.json({
                raw: {
                    success: false,
                    original_query: query,
                    error: error,
                    result: "Something went wrong while processing your request"
                },
                markdown: "...",
                type: "markdown",
                desc: "Something went wrong while processing your request"
            });
        }
    }
});

app.post('/api/auth/consultant', async (req, res) => {
    try {
        const { name, password } = req.body;
        console.log(req.body);
        const sqlQuery = `
  SELECT "Consultant Name" 
  FROM consultants_passwords 
  WHERE unaccent("Consultant Name") ILIKE unaccent('%${name}%') 
  AND passwords = '${password}';
`;
        //console.log(`Query to execute for login`);
        const result = await executeQueryAuth(sqlQuery);

        if (result.length > 0) {
            if (result.length > 1) {
                return res.json({
                    success: true,
                    message: `multiple consultants with the same name`,
                    result: result
                })
            }
            return res.json({
                success: true,
                message: `User ${name} logged in successfully`,
                result: result[0]["Consultant Name"]
            })
        }
        else {
            return res.json({
                success: false,
                message: `No consultant found with that name and password`,
                result: result
            })
        }
    }
    catch (error) {
        console.log(`Error: ${error}`)
        return res.json({
            success: false,
            message: `An error ocurred, try again`
        })
    }
})

app.post('/api/auth/coordinator', async (req, res) => {
    try {
        const { name, password } = req.body;
        const sqlQuery = `SELECT "Coordinator" FROM coordinators_passwords WHERE "Coordinator" = '${name}' AND passwords = '${password}';`;
        console.log(`Query to execute for login`);
        const result = await executeQueryAuth(sqlQuery);

        if (result.length > 0) {
            if (result.length > 1) {
                return res.json({
                    success: true,
                    message: `Multiple coordinators with the same name`,
                    results: result
                })
            }
            return res.json({
                success: true,
                message: `User ${name} logged in successfully`,
                results: result[0]
            })
        }
        else {
            return res.json({
                success: false,
                message: `No consultant found with that name and code`,
                results: result
            })
        }
    }
    catch (error) {
        console.log(`Error: ${error}`)
        return res.json({
            success: false,
            message: `An error ocurred, try again`
        })
    }
})


// 3. El Endpoint Solicitado (Add or Update)
app.post('/api/db/add_name_db', async (req, res) => {
    try {
        const { name, username } = req.body;

        // Validación mejorada
        if (!name || !username) {
            return res.status(400).json({
                success: "false",
                message: "Los campos 'name' y 'username' son obligatorios"
            });
        }

        console.log(`Intentando agregar/actualizar en SUPABASE para usuario: ${username} (nombre: ${name})`);

        // QUERY corregida
        const sqlQuery = `
            INSERT INTO consultants (username, name) 
            VALUES ($1, $2)
            ON CONFLICT (username) 
            DO UPDATE SET 
                name = EXCLUDED.name
            RETURNING *;
        `;

        // Ejecutar la query con ambos parámetros
        const result = await pool.query(sqlQuery, [username, name]);

        return res.json({
            success: "true",
            message: `Consultant '${name}' (usuario: ${username}) procesado exitosamente`,
            data: result.rows[0],
            rowCount: result.rowCount
        });

    } catch (error) {
        console.error(`Error del servidor en /api/db/add_name_db:`, error);
        return res.status(500).json({
            success: "false",
            message: "Error interno del servidor",
            error: error.message
        });
    }
});

app.post('/api/db/add_name_db_coordinators', async (req, res) => {
    try {
        const { name, username } = req.body;

        // Validación mejorada
        if (!name || !username) {
            return res.status(400).json({
                success: "false",
                message: "Los campos 'name' y 'username' son obligatorios"
            });
        }

        console.log(`Intentando agregar/actualizar en SUPABASE para usuario: ${username} (nombre: ${name})`);

        // QUERY corregida
        const sqlQuery = `
            INSERT INTO coordinators (username, name) 
            VALUES ($1, $2)
            ON CONFLICT (username) 
            DO UPDATE SET 
                name = EXCLUDED.name
            RETURNING *;
        `;

        // Ejecutar la query con ambos parámetros
        const result = await pool.query(sqlQuery, [username, name]);

        return res.json({
            success: "true",
            message: `Consultant '${name}' (usuario: ${username}) procesado exitosamente`,
            data: result.rows[0],
            rowCount: result.rowCount
        });

    } catch (error) {
        console.error(`Error del servidor en /api/db/add_name_db:`, error);
        return res.status(500).json({
            success: "false",
            message: "Error interno del servidor",
            error: error.message
        });
    }
});

app.post('/api/auth/consultant/search', async (req, res) => {
    try {
        const { name } = req.body;

        if (!name || !name.trim()) {
            return res.json({
                success: false,
                message: 'El nombre es requerido',
                result: []
            });
        }

        const sqlQuery = `
  SELECT DISTINCT "Consultant Name" 
  FROM consultants_passwords 
  WHERE unaccent("Consultant Name") ILIKE unaccent('%${name}%');
`;
        const result = await executeQueryAuth(sqlQuery);

        if (result.length === 0) {
            return res.json({
                success: false,
                message: 'No se encontró ningún consultor con ese nombre',
                result: []
            });
        }

        if (result.length === 1) {
            return res.json({
                success: true,
                message: 'Consultor encontrado',
                result: result
            });
        }

        return res.json({
            success: true,
            message: `Se encontraron ${result.length} consultores con nombres similares`,
            result: result
        });

    } catch (error) {
        console.log(`Error: ${error}`);
        return res.json({
            success: false,
            message: 'Ocurrió un error, intenta de nuevo',
            result: []
        });
    }
});

//initialize server with app.listen method, if there are no errors when initializing
//the server then it will print succesfully in the console, if not then print error
app.listen(PORT, (error) => {
    if (!error)
        console.log(`Server running on http://localhost:${PORT}`);
    else
        console.log("Error occurred, server can't start", error);
});