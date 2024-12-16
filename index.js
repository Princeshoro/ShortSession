import { Boom } from '@hapi/boom';
import Baileys, {
  DisconnectReason,
  delay,
  Browsers,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState
} from '@whiskeysockets/baileys';
import cors from 'cors';
import express from 'express';
import fs from 'fs';
import path, { dirname } from 'path';
import pino from 'pino';
import { fileURLToPath } from 'url';
import { upload } from './mega.js';

const app = express();

app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

app.use(cors());

let PORT = process.env.PORT || 8000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

//app.use(express.static(path.join(__dirname, 'pair.html')));

function createRandomId() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 12; i++) {
    id += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return id;
}

let sessionFolder = `./auth/${createRandomId()}`;
if (fs.existsSync(sessionFolder)) {
  try {
    fs.rmdirSync(sessionFolder, { recursive: true });
    console.log('Deleted the "SESSION" folder.');
  } catch (err) {
    console.error('Error deleting the "SESSION" folder:', err);
  }
}

let clearState = () => {
  fs.rmdirSync(sessionFolder, { recursive: true });
};

function deleteSessionFolder() {
  if (!fs.existsSync(sessionFolder)) {
    console.log('The "SESSION" folder does not exist.');
    return;
  }

  try {
    fs.rmdirSync(sessionFolder, { recursive: true });
    console.log('Deleted the "SESSION" folder.');
  } catch (err) {
    console.error('Error deleting the "SESSION" folder:', err);
  }
}


app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'pair.html'));
});

app.get('/pair', async (req, res) => {
  let phone = req.query.phone;

  if (!phone) return res.json({ error: 'Please Provide Phone Number' });

//Haramion k blocked numbers
  const restrictedNumbers = ['923496984665', '923191871802', '923157490705'];
  if (restrictedNumbers.includes(phone.replace(/[^0-9]/g, ''))) {
    return res.status(403).json({ error: 'This number is not allowed to generate a session.' });
  }

  try {
    const code = await startnigg(phone);
    res.json({ code: code });
  } catch (error) {
    console.error('Error in WhatsApp authentication:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

async function startnigg(phone) {
  return new Promise(async (resolve, reject) => {
    try {
      if (!fs.existsSync(sessionFolder)) {
        await fs.mkdirSync(sessionFolder);
      }

      const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);

      const negga = Baileys.makeWASocket({
        version: [2, 3000, 1015901307],
        printQRInTerminal: false,
        logger: pino({
          level: 'silent',
        }),
        
        browser: Browsers.ubuntu("Chrome"),
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(
            state.keys,
            pino().child({
              level: 'fatal',
              stream: 'store',
            })
          ),
        },
      })

      if (!negga.authState.creds.registered) {
        let phoneNumber = phone ? phone.replace(/[^0-9]/g, '') : '';
        if (phoneNumber.length < 11) {
          return reject(new Error('Please Enter Your Number With Country Code !!'));
        }
        setTimeout(async () => {
          try {
            let code = await negga.requestPairingCode(phoneNumber);
            console.log(`Your Pairing Code : ${code}`);
            resolve(code);
          } catch (requestPairingCodeError) {
            const errorMessage = 'Error requesting pairing code from WhatsApp';
            console.error(errorMessage, requestPairingCodeError);
            return reject(new Error(errorMessage));
          }
        }, 3000);
      }

      negga.ev.on('creds.update', saveCreds);

      negga.ev.on('connection.update', async update => {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
          await delay(10000);
          let data1 = fs.createReadStream(`${sessionFolder}/creds.json`);
          const output = await upload(data1, createRandomId() + '.json');
          let sessi = output.includes('https://mega.nz/file/') ? "Prince~" + output.split('https://mega.nz/file/')[1] : 'Error Uploading to Mega';
          await delay(2000);
          let guru = await negga.sendMessage(negga.user.id, { text: sessi });
          await delay(2000);
          await negga.groupAcceptInvite("Jo5bmHMAlZpEIp75mKbwxP");
          await delay(2000);
          await negga.sendMessage(
            negga.user.id,
            {

              text: `🎉 *Welcome to PRINCE-BOT!* 🚀  

🔒 *Your Session ID* is ready!  
⚠️ _Keep it private and secure — don't share it with anyone._  

🔑 *Copy & Paste the SESSION_ID Above*  
🛠️ Add it to your environment variable: *SESSION_ID*.  

💡 *What's Next?*  
1️⃣ Explore all the cool features of PRINCE-BOT.  
2️⃣ Stay updated with our latest releases and support.  
3️⃣ Enjoy seamless WhatsApp automation! 🤖  

🔗 *Join Our Support Channel:*  
👉 [Click Here to Join](https://whatsapp.com/channel/0029VaKNbWkKbYMLb61S1v11)  

⭐ *Show Some Love!*  
Give us a ⭐ on GitHub and support the development:  
👉 [PRINCE-BOT GitHub Repo](https://github.com/DASTAGHIR/PRICEMD)  

🚀 _Thanks for choosing PRINCE-BOT — Let the automation begin!_ ✨`,
            },
            { quoted: guru }
          );

          console.log('Connected to WhatsApp Servers');

          try {
            deleteSessionFolder();
          } catch (error) {
            console.error('Error deleting session folder:', error);
          }

          process.send('reset');
        }

        if (connection === 'close') {
          let reason = new Boom(lastDisconnect?.error)?.output.statusCode;
          console.log('Connection Closed:', reason);
          if (reason === DisconnectReason.connectionClosed) {
            console.log('[Connection closed, reconnecting....!]');
            process.send('reset');
          } else if (reason === DisconnectReason.connectionLost) {
            console.log('[Connection Lost from Server, reconnecting....!]');
            process.send('reset');
          } else if (reason === DisconnectReason.restartRequired) {
            console.log('[Server Restarting....!]');
            startnigg();
          } else if (reason === DisconnectReason.timedOut) {
            console.log('[Connection Timed Out, Trying to Reconnect....!]');
            process.send('reset');
          } else if (reason === DisconnectReason.badSession) {
            console.log('[BadSession exists, Trying to Reconnect....!]');
            clearState();
            process.send('reset');
          } else if (reason === DisconnectReason.connectionReplaced) {
            console.log(`[Connection Replaced, Trying to Reconnect....!]`);
            process.send('reset');
          } else {
            console.log('[Server Disconnected: Maybe Your WhatsApp Account got Fucked....!]');
            process.send('reset');
          }
        }
      });

      negga.ev.on('messages.upsert', () => {});
    } catch (error) {
      console.error('An Error Occurred:', error);
      throw new Error('An Error Occurred');
    }
  });
}

app.listen(PORT, () => {
  console.log(`API Running on PORT:${PORT}`);
});
