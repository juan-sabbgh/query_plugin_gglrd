# Natural Language Data Query API

This project is a Node.js Express server that acts as an intelligent API layer for a PostgreSQL database. It's designed to take a raw SQL query, execute it, and then use an external AI agent to generate a natural language summary of the results. It can also format the output specifically for rendering various types of charts (bar, line, pie, scatter).

## ✨ Features

  - **Direct SQL Execution**: Executes SQL queries directly against a PostgreSQL database.
  - **AI-Powered Summaries**: Leverages an external AI service to interpret and summarize query results in natural language.
  - **Chart-Ready Responses**: Formats data specifically for front-end charting libraries based on a simple request parameter.
  - **Secure Configuration**: Uses environment variables to keep database and API credentials safe.
  - **Robust Connection Management**: Uses a connection pool (`node-postgres`) for efficient and reliable database interactions.
  - **Flexible**: Easily adaptable for different PostgreSQL databases, including cloud services like Supabase.

## 🛠️ Tech Stack

  - **Backend**: Node.js, Express.js
  - **Database Driver**: `pg` (node-postgres) for PostgreSQL connectivity.
  - **Configuration**: `dotenv` for managing environment variables.
  - **External AI**: Connects to the Dyna AI agent platform for natural language processing.

-----

## 🚀 Getting Started

Follow these instructions to get a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

You'll need the following installed on your machine:

  * [Node.js](https://nodejs.org/) (which includes npm)
  * Access to a PostgreSQL database (e.g., a local instance or a cloud-based one like [Supabase](https://supabase.com/)).
  * API credentials for the Dyna AI agent service.

### Installation & Setup

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/your-username/your-repo-name.git
    cd your-repo-name
    ```

2.  **Install dependencies:**

    ```bash
    npm install
    ```

3.  **Create an environment file:**
    Create a file named `.env` in the root of the project and populate it with your specific credentials. Use the `.env.example` file as a template:

    ```ini
    # .env.example

    # Dyna AI Agent Credentials
    AGENT_TOKEN=your_agent_token_here
    AGENT_KEY=your_agent_key_here
    AS_ACCOUNT=your_agent_account_or_username_here

    # PostgreSQL Database Credentials (e.g., from Supabase)
    DB_HOST=your_database_host
    DB_PORT=5432
    DB_PASSWORD=your_database_password
    DB_USER=your_database_user
    DB_NAME=postgres
    ```

    > **Note for Supabase users**: You can find these credentials in your Supabase project under `Settings` \> `Database`. Ensure you set `ssl: { rejectUnauthorized: false }` in `dbConfig` if required.

4.  **Start the server:**

    ```bash
    node server.js
    ```

    The server should now be running on `http://localhost:3000`.

-----

## 📖 API Usage

The server exposes a single endpoint to handle all data requests.

### Endpoint: `POST /api/get_recommendation`

This endpoint executes a SQL query, gets an AI-powered summary, and formats the response.

#### Request Body

The request body must be a JSON object with two properties:

  * `query` (string, required): The raw SQL `SELECT` query to be executed.
  * `graph` (string, required): Determines the response format. Accepted values are `"bar"`, `"line"`, `"pie"`, `"scatter"`, or `"none"`.

#### Example `cURL` Request

```bash
curl -X POST http://localhost:3000/api/get_recommendation \
-H "Content-Type: application/json" \
-d '{
    "query": "SELECT \"Branch Name\", SUM(\"Line Total\") AS TotalSales FROM mytable GROUP BY \"Branch Name\" ORDER BY TotalSales DESC LIMIT 5;",
    "graph": "bar"
}'
```

#### Response Formats

##### 1\. When `graph` is "bar", "line", "pie", or "scatter"

The response is structured to be easily consumed by a charting library.

```json
{
    "data": [
        {"Branch Name": "Branch A", "totalsales": "50000.00"},
        {"Branch Name": "Branch B", "totalsales": "45000.00"}
    ],
    "raw": [
        {"Branch Name": "Branch A", "totalsales": "50000.00"},
        {"Branch Name": "Branch B", "totalsales": "45000.00"}
    ],
    "markdown": "| Branch Name | totalsales |\n|:---|:---|\n| Branch A | 50000.00 |\n| Branch B | 45000.00 |",
    "field_headers": ["Branch Name", "totalsales"],
    "chart_type": "bar",
    "type": "chart",
    "dimension": "Branch Name",
    "desc": "The query results show the total sales for the top branches. Branch A had the highest sales with $50,000."
}
```

  * `desc`: The AI-generated natural language summary.
  * `data`: The results from the database.
  * `field_headers`: An array of column names.
  * `dimension`: The primary categorical field (usually the first column), used for the chart's axis labels.
  * `metrics` (for `pie` charts only): The numerical field for the pie slices.

##### 2\. When `graph` is "none"

The response is a more general-purpose format.

```json
{
    "raw": {
        "success": true,
        "original_query": "SELECT * FROM mytable LIMIT 2;",
        "result_count": 2,
        "result": "The query was processed successfully"
    },
    "markdown": "...",
    "type": "markdown",
    "desc": "Here are the first two records from your table as requested."
}
```

-----

## ⚙️ How It Works

1.  A `POST` request is sent to `/api/get_recommendation` with a SQL query and a graph type.
2.  The `executeQuery` function uses the `pg` pool to securely run the SQL query against the database.
3.  The raw results from the database and the original query are sent to the `getChatSummary` function.
4.  `getChatSummary` makes a `POST` request to the Dyna AI agent API, asking it to interpret the data.
5.  The server receives the natural language summary back from the AI agent.
6.  Based on the `graph` parameter in the initial request, the server assembles a final JSON response containing the database results and the AI summary, formatted appropriately for a chart or a simple text display.
7.  The final JSON object is sent back to the client.