const express = require('express');
const bodyParser = require('body-parser');
const ejs = require('ejs');
const puppeteer = require('puppeteer-core');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const app = express();

// Configure CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// Middleware
app.use(bodyParser.json());
app.use('/public', express.static(path.join(__dirname, 'public')));

// Ensure directories exist
const publicImagesDir = path.join(__dirname, 'public', 'images');
fs.mkdir(publicImagesDir, { recursive: true }).catch(console.error);

// Função para obter o caminho do Chrome baseado no ambiente
const getChromePath = () => {
  if (process.env.NODE_ENV === 'production') {
    return process.env.CHROME_EXECUTABLE_PATH || '/app/.apt/usr/bin/google-chrome';
  }
  return process.platform === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : '/usr/bin/google-chrome';
};

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/gerar-comprovante', async (req, res) => {
  console.log('Recebendo requisição para gerar comprovante');
  
  try {
    const {
      nomeRemetente = "Virginia Fonseca Costa",
      cpfRemetente = "***.907.070-**",
      bancoRemetente = "Banco Bradesco S.A.",
      nomeDestinatario = "Daniel De Lima Mendes",
      cpfDestinatario = "***.641.357-**",
      bancoDestinatario = "Nubank",
      chavePix = "teste@teste.com",
      valor = "R$ 1.000,00",
      tarifa = "R$ 0,00",
      descricao = "Corrente",
      tipoConta = "Poupança",
      dataHora = new Date().toLocaleString('pt-BR'),
      numeroControle = "9B8C7D59716B63DBB48D5A8A37FABDC",
      autenticacao = "m7efjKlQX2bo+ZMyme7OhIlIlaX8V3X3 Ck1Pz8yj4E="
    } = req.body;

    console.log('Dados recebidos:', { nomeRemetente, nomeDestinatario, valor });

    const templatePath = path.join(__dirname, 'views', 'comprovante.ejs');
    console.log('Caminho do template:', templatePath);

    // Verifica se o arquivo existe
    await fs.access(templatePath);

    const html = await ejs.renderFile(templatePath, {
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
    });

    console.log('Template renderizado com sucesso');

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

    console.log('Browser iniciado');

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
    
    console.log('Screenshot gerado:', filePath);
    
    await browser.close();

    const imageUrl = `${req.protocol}://${req.get('host')}/public/images/${fileName}`;
    console.log('URL da imagem:', imageUrl);
    
    res.json({ 
      success: true,
      imageUrl: imageUrl
    });
    
    // Limpar imagens antigas após um tempo
    setTimeout(async () => {
      try {
        await fs.unlink(filePath);
        console.log('Arquivo removido:', filePath);
      } catch (err) {
        console.error('Erro ao remover arquivo:', err);
      }
    }, 1800000); // 30 minutos
    
  } catch (error) {
    console.error('Erro detalhado:', error);
    res.status(500).json({ 
      error: 'Erro ao gerar comprovante',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log('Ambiente:', process.env.NODE_ENV);
  console.log('Caminho do Chrome:', getChromePath());
});
