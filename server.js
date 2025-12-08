const express = require("express");
const app = express();
app.use(express.static("public")); // sua pasta do HTML

// variáveis de monitoramento
let statusBot = {
    online: false,
    ultimaMsg: ""
};

// rota usada pelo painel
app.get("/status", async (req, res) => {
    const [ranking] = await pool.query(`
        SELECT pergunta, COUNT(*) as total 
        FROM perguntas 
        GROUP BY pergunta 
        ORDER BY total DESC
    `);

    res.json({
        online: statusBot.online,
        ultimaMsg: statusBot.ultimaMsg,
        ranking
    });
});

app.listen(3000, () => console.log("Painel rodando em http://localhost:3000"));