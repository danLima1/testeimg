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

// Também criar o diretório views
const viewsDir = path.join(__dirname, 'views');
fs.mkdir(viewsDir, { recursive: true }).catch(console.error);

// Função para obter o caminho do Chrome baseado no ambiente
const getChromePath = () => {
  if (process.env.NODE_ENV === 'production') {
    return '/app/.chrome-for-testing/chrome-linux64/chrome';
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

    console.log('Dados recebidos:', { 
      nomeRemetente, 
      nomeDestinatario, 
      valor,
      dataHora 
    });

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

    console.log('Iniciando browser com caminho:', getChromePath());
    
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: getChromePath(),
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-extensions'
      ],
      ignoreHTTPSErrors: true
    });

    console.log('Browser iniciado');

    const page = await browser.newPage();
    await page.setViewport({ width: 800, height: 1200 });
    await page.setContent(html, {waitUntil: 'networkidle0'});
    
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