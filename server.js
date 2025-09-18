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


async function getChatSummary(question, db_result) {
    try {

        // Crea el objeto con los datos que quieres enviar en el cuerpo (body)
        const requestData = {
            username: AS_ACCOUNT,
            question: question
        };

        const response = await fetch(url, {
            // Método HTTP, equivalente a -X POST
            method: 'POST',

            // Cabeceras, equivalente a las opciones -H
            headers: {
                'Content-Type': 'application/json',
                'cybertron-robot-key': AGENT_KEY,
                'cybertron-robot-token': AGENT_TOKEN
            },

            // Cuerpo de la solicitud, equivalente a la opción -d
            // Se convierte el objeto de JS a una cadena de texto en formato JSON
            body: JSON.stringify(requestData)
        });

        // Verifica si la respuesta fue exitosa (código de estado 200-299)
        if (!response.ok) {
            throw new Error(`Error en la solicitud: ${response.status} ${response.statusText}`);
        }

        // Convierte la respuesta a JSON
        const data = await response.json();

        return data.data.answer;

        // Muestra la respuesta en la consola
        console.log('Respuesta exitosa:', data);

    } catch (error) {
        // Captura y muestra cualquier error que ocurra (de red, etc.)
        console.error('Ocurrió un error:', error);
    }
}



app.use(express.json());

app.post('/api/get_recommendation', async (req, res) => {
    //get info from the json sent in the request
    const {
        query,
        graph
    } = req.body;

    //make query
    const results_query = await executeQuery(query);
    //send result for agent to interpret them
    const chat_summary = await getChatSummary(query, results_query);

    if (chat_summary) {
        //return
        res.json({
            raw: {
                success: true,
                query_processed: query,
                result: "The query was processed succesfully"
            },
            markdown: "...",
            type: "markdown",
            desc: `${chat_summary}`
        });
    }
    else{
        res.json({
            raw: {
                success: true,
                query_processed: query,
                result: "The query was processed succesfully"
            },
            markdown: "...",
            type: "markdown",
            desc: `Your request wasnt processed correctly, try again`
        });
    }

})

//initialize server with app.listen method, if there are no errors when initializing
//the server then it will print succesfully in the console, if not then print error
app.listen(PORT, (error) => {
    if (!error)
        console.log(`Server running on http://localhost:${PORT}`);
    else
        console.log("Error occurred, server can't start", error);
}
);