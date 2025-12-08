require("dotenv").config();
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const pool = require("./db");
const P = require("pino");
const http = require("http");
const fs = require("fs");
const path = require("path");
const qrcode = require("qrcode-terminal");
const QRCode = require("qrcode");

let isOnline = false;
let ultimaMsg = "";
let currentQR = "";

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState("./auth");

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: P({level:"silent"}),
        browser: ["Chrome (Bot)", "Chrome", "1.0.0"]

    });
    sock.ev.on("creds.update", saveCreds);
    console.log("🤖 Bot iniciado!");
    isOnline = true;

    // único listener de connection.update com QR
    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            currentQR = qr;
            console.clear();
            qrcode.generate(qr, { small: true });
            console.log("Abra http://localhost:3000/qr para visualizar o QR em imagem");
        }
        if (connection === "close") {
            isOnline = false;
            if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
                startBot();
            } else {
                console.log("❌ Bot deslogado. Escaneie o QR novamente.");
            }
        }
        if (connection === "open") {
            isOnline = true;
            console.log("✅ Conectado com sucesso");
        }
    });

    sock.ev.on("messages.upsert", async ({messages})=> {
        const msg = messages [0]
        if (!msg.message) return;

        const sender = msg.key.remoteJid;
        let texto =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            msg.message.imageMessage?.caption ||
            msg.message.videoMessage?.caption;

        if (!texto) return;
        texto = texto.trim();
        ultimaMsg = texto;

        // Comando inicial
        if (texto.toLowerCase() === "!iniciar"){
            try {
                await pool.query(
                    "INSERT INTO usuarios (usuario_id, total_atendimentos) VALUES (?, 1) ON DUPLICATE KEY UPDATE total_atendimentos = total_atendimentos + 1",
                    [sender]
                );
            } catch {}
            const menu = `
👋 *Bem-vindo ao atendimento UNA Linha Verde!*

Escolha sua dúvida:
1️⃣ Informações gerais do curso  
2️⃣ Valor e duração  
3️⃣ Disciplinas  
4️⃣ Dias e horários  
5️⃣ Local  
0️⃣ Encerrar  
            `;
            await sock.sendMessage(sender, { text: menu });
            return;


        }
        // Atender opções
        if (["0","1","2","3","4","5"].includes(texto)) {
            let resposta = "";

            if (texto === "1") {
                resposta = `
🏫 *Informações gerais*
UNA - Linha Verde  
Av. Cristiano Machado 11.157  
Curso: Capacitação em Musculação  
Duração: 12 meses
                `;
            }
            if (texto === "2") {
                resposta = `
💰 *Valores*
Matrícula: R$ 400  
Mensalidades: 11x de R$ 400
                `;
            }
            if (texto === "3") {
                resposta = `
📚 *Disciplinas*  
• Legalidade da profissão  
• Ética e normativas  
• Nutrição  
• Primeiros Socorros  
• Anatomia  
• Cinesiologia / Biomecânica  
• Fisiologia / Treinamento de força  
• Prescrição de exercícios / Grupos especiais  
                `;
            }
            if (texto === "4") {
                resposta = `
🕒 *Horário*
Sábados  
08:00 — 12:00
                `;
            }
            if (texto === "5") {
                resposta = `
📍 *Local*
UNA Linha Verde  
Av. Cristiano Machado 11.157
                `;
            }
            
            if (texto === "0"){
                resposta = "Atendimento encerrado 👋";
            }
            try {
                await pool.query(
                    "INSERT INTO perguntas (usuario_id, pergunta, vezes) VALUES (?, ?, 1)",
                    [sender, texto]
                );
                await pool.query(
                    "INSERT INTO logs (usuario_id, mensagem) VALUES (?, ?)",
                    [sender, resposta]
                );
            } catch {}

            await sock.sendMessage(sender, { text: resposta });

            if (texto !== "0"){
                const menu = `
Deseja mais alguma coisa?

1️⃣ Informações gerais  
2️⃣ Valor e duração  
3️⃣ Disciplinas  
4️⃣ Dias e horários  
5️⃣ Local  
0️⃣ Encerrar  
                `;
                await sock.sendMessage(sender, { text: menu });
            }
        }


    });
    
}
function startServer() {
    const server = http.createServer(async (req, res) => {
        if (req.method === "GET" && req.url === "/") {
            const filePath = path.join(__dirname, "public.html");
            fs.readFile(filePath, (err, data) => {
                if (err) {
                    res.writeHead(500, { "Content-Type": "text/plain" });
                    res.end("Erro interno");
                    return;
                }
                res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
                res.end(data);
            });
            return;
        }
        if (req.method === "GET" && req.url === "/status") {
            try {
                const [rows] = await pool.query(
                    "SELECT pergunta, SUM(vezes) AS quantidade FROM perguntas GROUP BY pergunta ORDER BY quantidade DESC LIMIT 10"
                );
                const body = JSON.stringify({ online: isOnline, ultimaMsg, ranking: rows });
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(body);
            } catch (e) {
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "falha" }));
            }
            return;
        }
        if (req.method === "GET" && req.url === "/qr.png") {
            if (!currentQR) {
                res.writeHead(404, { "Content-Type": "text/plain" });
                res.end("QR indisponível");
                return;
            }
            try {
                const buf = await QRCode.toBuffer(currentQR, { type: "png" });
                res.writeHead(200, { "Content-Type": "image/png" });
                res.end(buf);
            } catch {
                res.writeHead(500, { "Content-Type": "text/plain" });
                res.end("Falha ao gerar QR");
            }
            return;
        }
        if (req.method === "GET" && req.url === "/qr") {
            const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>QR</title></head><body><h1>Escaneie o QR</h1><p>${currentQR ? "" : "Aguardando QR..."}</p><img src="/qr.png" alt="QR" style="max-width:90vw;"/><script>setInterval(()=>location.reload(),3000)</script></body></html>`;
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(html);
            return;
        }
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
    });
    const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
    server.listen(port);
}
startBot();
startServer();

