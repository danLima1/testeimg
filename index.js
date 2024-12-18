const express = require('express');
const bodyParser = require('body-parser');
const ejs = require('ejs');
const puppeteer = require('puppeteer-core');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const app = express();

// Configure CORS to allow all origins, methods, and headers
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// Serve static files from the public directory
app.use('/public', express.static('public'));
app.use(bodyParser.json());

// Ensure public/images directory exists
const publicImagesDir = path.join(__dirname, 'public', 'images');
fs.mkdir(publicImagesDir, { recursive: true }).catch(console.error);

// Função para obter o caminho do Chrome baseado no ambiente
const getChromePath = () => {
  if (process.env.NODE_ENV === 'production') {
    // Caminho do Chrome no Heroku
    return process.env.CHROME_EXECUTABLE_PATH || '/app/.apt/usr/bin/google-chrome';
  }
  // Caminho local para desenvolvimento
  return process.platform === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : '/usr/bin/google-chrome';
};

app.post('/gerar-comprovante', async (req, res) => {
  const {
    nomeRemetente,
    cpfRemetente,
    bancoRemetente,
    nomeDestinatario,
    cpfDestinatario,
    bancoDestinatario,
    chavePix,
    valor,
    tarifa,
    descricao,
    tipoConta,
    dataHora,
    numeroControle,
    autenticacao
  } = req.body;

  try {
    const html = await ejs.renderFile('./views/comprovante.ejs', {
      nomeRemetente: nomeRemetente || "Virginia Fonseca Costa",
      cpfRemetente: cpfRemetente || "***.907.070-**",
      bancoRemetente: bancoRemetente || "Banco Bradesco S.A.",
      nomeDestinatario: nomeDestinatario || "Daniel De Lima Mendes",
      cpfDestinatario: cpfDestinatario || "***.641.357-**",
      bancoDestinatario: bancoDestinatario || "aw",
      chavePix: chavePix || "a",
      valor: valor || "R$ 1.000,00",
      tarifa: tarifa || "R$ 0,00",
      descricao: descricao || "Corrente",
      tipoConta: tipoConta || "Poupança",
      dataHora: dataHora || new Date().toLocaleString('pt-BR'),
      numeroControle: numeroControle || "9B8C7D59716B63DBB48D5A8A37FABDC",
      autenticacao: autenticacao || "m7efjKlQX2bo+ZMyme7OhIlIlaX8V3X3 Ck1Pz8yj4E="
    });

    // Configuração do browser com puppeteer-core
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: getChromePath(),
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--lang=pt-BR'
      ]
    });

    const page = await browser.newPage();
    await page.setContent(html, {waitUntil: 'networkidle0'});
    await page.setViewport({ width: 800, height: 1200 });
    
    const fileName = `comprovante-${crypto.randomBytes(8).toString('hex')}.png`;
    const filePath = path.join(publicImagesDir, fileName);
    
    await page.screenshot({ 
      path: filePath,
      fullPage: true,
      type: 'png'
    });
    
    await browser.close();

    const imageUrl = `${req.protocol}://${req.get('host')}/public/images/${fileName}`;
    
    res.json({ 
      success: true,
      imageUrl: imageUrl
    });
    
    // Limpar imagens antigas após um tempo
    setTimeout(async () => {
      try {
        await fs.unlink(filePath);
      } catch (err) {
        console.error('Error deleting file:', err);
      }
    }, 1800000); // Remove após 30 minutos
    
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao gerar comprovante' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
