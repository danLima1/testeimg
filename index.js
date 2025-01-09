const express = require('express');
const bodyParser = require('body-parser');
const ejs = require('ejs');
const puppeteer = require('puppeteer-core');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const Jimp = require('jimp');

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
  let browser = null;
  
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
    
    browser = await puppeteer.launch({
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
    
    // Aguardar a screenshot ser completada
    await page.screenshot({ 
      path: filePath,
      fullPage: true,
      type: 'png'
    });
    
    console.log('Screenshot gerado:', filePath);

    const imageUrl = `${req.protocol}://${req.get('host')}/public/images/${fileName}`;
    console.log('URL da imagem:', imageUrl);
    
    // Fechar o browser após tudo estar pronto
    if (browser) {
      await browser.close();
      console.log('Browser fechado com sucesso');
    }
    
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
    // Garantir que o browser seja fechado mesmo em caso de erro
    if (browser) {
      try {
        await browser.close();
        console.log('Browser fechado após erro');
      } catch (closeError) {
        console.error('Erro ao fechar browser:', closeError);
      }
    }
    res.status(500).json({ 
      error: 'Erro ao gerar comprovante',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

app.post('/gerar-cartao', async (req, res) => {
  try {
    const { primeiroNome, ultimoNome } = req.body;
    
    if (!primeiroNome || !ultimoNome) {
      return res.status(400).json({ error: 'Primeiro nome e último nome são obrigatórios' });
    }

    try {
      // Carregar a imagem base do cartão
      const baseImagePath = path.join(__dirname, 'public', 'images', 'card-base.png');
      const image = await Jimp.read(baseImagePath);
      
      // Carregar a fonte
      const font = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
      
      // Pegar apenas o primeiro nome e último nome
      const primeiro = primeiroNome.split(' ')[0];
      const ultimo = ultimoNome.split(' ').pop();
      
      // Texto a ser adicionado (apenas primeiro e último nome em maiúsculas)
      const text = `${primeiro} ${ultimo}`.toUpperCase();
      
      // Obter dimensões da imagem
      const imageWidth = image.getWidth();
      const imageHeight = image.getHeight();
      
      // Medir o texto para centralizá-lo
      const textWidth = Jimp.measureText(font, text);
      const textHeight = Jimp.measureTextHeight(font, text, textWidth);
      
      // Calcular posição para centralizar (com ajustes para baixo e esquerda)
      const x = ((imageWidth - textWidth) / 2) - 100; // subtraindo 100 para mover para esquerda
      const y = ((imageHeight - textHeight) / 2) + 150; // aumentado para +150 para descer mais o texto
      
      // Adicionar texto na imagem
      image.print(
        font,
        x, // posição X ajustada para esquerda
        y, // posição Y ajustada mais para baixo
        text
      );
      
      // Gerar nome único para o arquivo
      const fileName = `card-${crypto.randomBytes(8).toString('hex')}.png`;
      const outputPath = path.join(publicImagesDir, fileName);
      
      // Salvar a imagem
      await image.writeAsync(outputPath);
      
      // Gerar URL da imagem
      const imageUrl = `${req.protocol}://${req.get('host')}/public/images/${fileName}`;
      
      // Limpar a imagem após 30 minutos
      setTimeout(async () => {
        try {
          await fs.unlink(outputPath);
          console.log('Arquivo do cartão removido:', outputPath);
        } catch (err) {
          console.error('Erro ao remover arquivo do cartão:', err);
        }
      }, 1800000);
      
      res.json({
        success: true,
        imageUrl
      });
    } catch (imageError) {
      console.error('Erro ao processar imagem:', imageError);
      throw imageError;
    }
    
  } catch (error) {
    console.error('Erro ao gerar cartão:', error);
    res.status(500).json({
      error: 'Erro ao gerar cartão',
      details: error.message
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log('Ambiente:', process.env.NODE_ENV);
  console.log('Caminho do Chrome:', getChromePath());
}); 