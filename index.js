const express = require('express');
const bodyParser = require('body-parser');
const ejs = require('ejs');
const puppeteer = require('puppeteer-core');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const Jimp = require('jimp');
const { createCanvas, loadImage, registerFont } = require('canvas');

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

app.use(bodyParser.json());
app.use('/public', express.static(path.join(__dirname, 'public')));

const publicImagesDir = path.join(__dirname, 'public', 'images');
fs.mkdir(publicImagesDir, { recursive: true }).catch(console.error);

const viewsDir = path.join(__dirname, 'views');
fs.mkdir(viewsDir, { recursive: true }).catch(console.error);

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
    
    if (browser) {
      await browser.close();
      console.log('Browser fechado com sucesso');
    }
    
    res.json({ 
      success: true,
      imageUrl: imageUrl
    });
    
    setTimeout(async () => {
      try {
        await fs.unlink(filePath);
        console.log('Arquivo removido:', filePath);
      } catch (err) {
        console.error('Erro ao remover arquivo:', err);
      }
    }, 1800000); 
    
  } catch (error) {
    console.error('Erro detalhado:', error);
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
      const baseImagePath = path.join(__dirname, 'public', 'images', 'card-base.png');
      const image = await Jimp.read(baseImagePath);
      
      const font = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE);
      
      const primeiro = primeiroNome.split(' ')[0];
      const ultimo = ultimoNome.split(' ').pop();
      
      const text = `${primeiro} ${ultimo}`.toUpperCase();
      
      const imageWidth = image.getWidth();
      const imageHeight = image.getHeight();
      
      const textWidth = Jimp.measureText(font, text);
      const textHeight = Jimp.measureTextHeight(font, text, textWidth);
      
      const x = ((imageWidth - textWidth) / 2) - 230; // subtraindo 100 para mover para esquerda
      const y = ((imageHeight - textHeight) / 2) + 330; // aumentado para +150 para descer mais o texto
      
      image.print(
        font,
        x, 
        y, 
        text
      );
      
      const fileName = `card-${crypto.randomBytes(8).toString('hex')}.png`;
      const outputPath = path.join(publicImagesDir, fileName);
      
      await image.writeAsync(outputPath);
      
      const imageUrl = `${req.protocol}://${req.get('host')}/public/images/${fileName}`;
      
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

app.post('/gerar-gov', async (req, res) => {
  try {
    const { nome, valor } = req.body; 
    if (!nome) {
      return res.status(400).json({ error: 'Nome é obrigatório' });
    }

    try {
      registerFont(path.join(__dirname, 'fonts', 'arial-bold-20.fnt.TTF'), { family: 'Arial Bold' });
      
      const baseImagePath = path.join(__dirname, 'public', 'images', 'gov.jpeg');
      const baseImage = await loadImage(baseImagePath);
      
      const canvas = createCanvas(baseImage.width, baseImage.height);
      const ctx = canvas.getContext('2d');
      
      ctx.drawImage(baseImage, 0, 0);
      
      ctx.font = '16px "Arial Bold"';
      ctx.fillStyle = '#000000';
      
      ctx.fillText(nome, 25, 135);
      
      ctx.font = '13px "Arial Bold"';
      
      const dataAtual = new Date();
      const dataAjustada = new Date(dataAtual.getTime() - (3 * 60 * 60 * 1000));
      const dataFormatada = dataAjustada.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }); 
      
      ctx.fillStyle = '#000000';
      ctx.fillText(dataFormatada, 137, 180);
      
      ctx.fillStyle = 'green';
      ctx.fillRect(630, 150, 100, 20);
      
      ctx.font = '16px Arial Bold';
      ctx.fillStyle = 'white';
      ctx.fillText(dataFormatada, 453, 182);
      
      ctx.fillStyle = 'green';
      ctx.fillRect(630, 190, 100, 20); // 40 pixels abaixo do primeiro retângulo

      ctx.font = '16px Arial Bold';
      ctx.fillStyle = 'white';

      const valorFinal = valor || '42,90';      
      ctx.fillText(`R$ ${valorFinal}`, 453, 231); 
      
      const fileName = `gov-${crypto.randomBytes(8).toString('hex')}.png`;
      const outputPath = path.join(publicImagesDir, fileName);
      
      const buffer = canvas.toBuffer('image/png');
      await fs.writeFile(outputPath, buffer);
      
      const imageUrl = `${req.protocol}://${req.get('host')}/public/images/${fileName}`;
      
      // Limpar a imagem após 30 minutos
      setTimeout(async () => {
        try {
          await fs.unlink(outputPath);
          console.log('Arquivo gov removido:', outputPath);
        } catch (err) {
          console.error('Erro ao remover arquivo gov:', err);
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
    console.error('Erro ao gerar documento gov:', error);
    res.status(500).json({
      error: 'Erro ao gerar documento gov',
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
