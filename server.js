//import express library
const express = require('express');
const mysql = require('mysql2/promise');

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
    database: DB_NAME
};

// Crea un pool de conexiones para manejar las consultas de forma eficiente
const pool = mysql.createPool(dbConfig);

async function executeQuery(sql) {
    let connection;
    try {
        // Obtiene una conexión del pool
        connection = await pool.getConnection();

        // Ejecuta la consulta con los parámetros
        // El driver se encarga de escapar los valores para prevenir inyecciones SQL
        const [results] = await connection.execute(sql, []);
        console.log(results)
        return results;

    } catch (error) {
        // Si hay un error, lo muestra en consola y lo lanza para que sea manejado
        console.error("Error al ejecutar la consulta:", error);
        throw error;
    } finally {
        // Asegura que la conexión se libere y vuelva al pool, sin importar si hubo error o no
        if (connection) {
            connection.release();
        }
    }
}

async function convertQuestionToSQL(naturalLanguageQuestion) {
    try {
        // Create prompt for the AI to convert natural language to SQL
        const prompt = `Convert this natural language question to a valid MySQL SELECT query: "${naturalLanguageQuestion}". 
        Return ONLY the SQL query without any explanations, comments, or additional text. 
        If you cannot convert it to a valid SQL query, return "ERROR". Do not implement any "_" to blank spaces, and add instead `` to the column of interest with the blank spaces (example: 'invoice issue date')`;

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
        const sqlQuery = data.data.answer.trim();

        // Basic validation of the returned SQL
        if (sqlQuery === 'ERROR' || !sqlQuery.toUpperCase().startsWith('SELECT')) {
            throw new Error('AI could not generate a valid SELECT query');
        }

        return sqlQuery;

    } catch (error) {
        console.error('Error converting question to SQL:', error);
        throw new Error(`Failed to convert question to SQL: ${error.message}`);
    }
}

async function getChatSummary(question, db_result) {
    try {
        // Create a more informative prompt including the database results
        const prompt = `Original question: "${question}"
        Database results: ${JSON.stringify(db_result)}
        
        Please provide a natural language summary and interpretation of these results.`;

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

app.use(express.json());

app.post('/api/get_recommendation', async (req, res) => {
    try {
        // Changed from 'query' to 'question' since we're now expecting natural language
        const { question, graph } = req.body;

        // Input validation
        if (!question || typeof question !== 'string' || question.trim().length === 0) {
            return res.status(400).json({
                error: 'Valid question is required',
                message: 'Please provide a natural language question about your data'
            });
        }

        console.log('Received question:', question);

        // Step 1: Convert natural language question to SQL
        const sqlQuery = await convertQuestionToSQL(question);
        console.log('Generated SQL query:', sqlQuery);

        // Step 2: Execute the SQL query
        const results = await executeQuery(sqlQuery);
        console.log('Query results:', results);

        // Step 3: Get AI interpretation of the results
        const chat_summary = await getChatSummary(question, results);

        // Step 4: Return the response
        res.json({
            raw: {
                success: true,
                original_question: question,
                generated_sql: sqlQuery,
                result_count: results.length,
                result: "The question was processed successfully"
            },
            markdown: "...",
            type: "markdown",
            desc: chat_summary
        });

    } catch (error) {
        console.error('Error in /api/get_recommendation:', error);
        
        // Provide helpful error messages based on the type of error
        if (error.message.includes('convert question to SQL')) {
            res.status(400).json({
                error: 'Could not understand question',
                message: 'Please rephrase your question or ask about something else',
                details: error.message
            });
        } else if (error.message.includes('SQL syntax')) {
            res.status(400).json({
                error: 'Database error',
                message: 'There was an issue with the generated query',
                details: error.message
            });
        } else {
            res.status(500).json({
                error: 'Internal server error',
                message: 'Something went wrong while processing your request',
                details: error.message
            });
        }
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