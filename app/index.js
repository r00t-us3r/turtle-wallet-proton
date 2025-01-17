/* eslint-disable no-unused-vars */
/* eslint-disable import/no-mutable-exports */
/* eslint-disable func-names */
import log from 'electron-log';
import os from 'os';
import fs from 'fs';
import path from 'path';
import React, { Fragment } from 'react';
import { render } from 'react-dom';
import { AppContainer as ReactHotAppContainer } from 'react-hot-loader';
import { ipcRenderer, remote, clipboard } from 'electron';
import { WalletBackend } from 'turtlecoin-wallet-backend';
import EventEmitter from 'events';
import Root from './containers/Root';
import { configureStore, history } from './store/configureStore';
import './app.global.css';
import WalletSession from './wallet/session';
import iConfig from './constants/config';
import AutoUpdater from './wallet/autoUpdater';
import LoginCounter from './wallet/loginCounter';

export function savedInInstallDir(savePath) {
  const installationDirectory = path.resolve(remote.app.getAppPath(), '../../');
  const saveAttemptDirectory = path.resolve(savePath, '../');
  if (
    saveAttemptDirectory === installationDirectory &&
    os.platform() === 'win32'
  ) {
    return true;
  }
  return false;
}

export let config = iConfig;

export const eventEmitter = new EventEmitter();
eventEmitter.setMaxListeners(2);

export const updater = new AutoUpdater();
updater.getLatestVersion();

export const loginCounter = new LoginCounter();

remote.app.setAppUserModelId('wallet.proton.extra');

log.debug(`Proton wallet started...`);

const homedir = os.homedir();

export const directories = [
  `${homedir}/.protonwallet`,
  `${homedir}/.protonwallet/logs`
];

const [programDirectory, logDirectory] = directories;

log.debug('Checking if program directories are present...');
// eslint-disable-next-line func-names
directories.forEach(function(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
    log.debug(`${dir} directories not detected, creating...`);
  } else if (dir === programDirectory) {
    log.debug('Directories found. Initializing wallet session...');
  }
});

if (!fs.existsSync(`${programDirectory}/config.json`)) {
  fs.writeFile(
    `${programDirectory}/config.json`,
    JSON.stringify(config, null, 4),
    err => {
      if (err) throw err;
      log.debug('Config not detected, wrote internal config to disk.');
    }
  );
} else {
  log.debug("Config file found in user's home directory, using it...");
  const rawUserConfig = fs.readFileSync(`${programDirectory}/config.json`);
  config = JSON.parse(rawUserConfig);
}

export let session = new WalletSession();

if (!session.loginFailed && !session.firstStartup) {
  log.debug('Initialized wallet session ', session.address);
  startWallet();
} else {
  log.debug('Login failed, redirecting to login...');
}

ipcRenderer.on('handleClose', function(evt, route) {
  if (!session.loginFailed && !session.firstStartup) {
    const saved = session.saveWallet(session.walletFile);
    if (saved) {
      remote.app.exit();
    }
  } else {
    remote.app.exit();
  }
});

eventEmitter.on('updateRequired', function(updateFile) {
  const userResponse = remote.dialog.showMessageBox(null, {
    type: 'info',
    buttons: ['Cancel', 'OK'],
    title: 'Update Required!',
    message:
      "There's an update to Proton wallet. Would you like to download it?"
  });
  if (userResponse === 1) {
    remote.shell.openExternal(updateFile);
    remote.app.exit();
  }
});

ipcRenderer.on('handleSaveSilent', function(evt, route) {
  if (!session.loginFailed && !session.firstStartup) {
    const saved = session.saveWallet(session.walletFile);
  }
});

// eslint-disable-next-line func-names
ipcRenderer.on('handleSave', function(evt, route) {
  const saved = session.saveWallet(session.walletFile);
  if (saved) {
    remote.dialog.showMessageBox(null, {
      type: 'info',
      buttons: ['OK'],
      title: 'Saved!',
      message: 'The wallet was saved successfully.'
    });
  } else {
    remote.dialog.showMessageBox(null, {
      type: 'error',
      buttons: ['OK'],
      title: 'Error!',
      message:
        'The wallet was not saved successfully. Check directory permissions and try again.'
    });
  }
});

ipcRenderer.on('handleSaveAs', function(evt, route) {
  const options = {
    defaultPath: remote.app.getPath('documents')
  };
  const savePath = remote.dialog.showSaveDialog(null, options);
  if (savePath === undefined) {
    return;
  }
  session.saveWallet(savePath);
  remote.dialog.showMessageBox(null, {
    type: 'info',
    buttons: ['OK'],
    title: 'Saved!',
    message: 'Your wallet was saved successfully.'
  });
});

ipcRenderer.on('exportToCSV', function(evt, route) {
  const options = {
    defaultPath: remote.app.getPath('documents')
  };
  const savePath = remote.dialog.showSaveDialog(null, options);
  if (savePath === undefined) {
    return;
  }
  log.debug(`Exporting transactions to csv file at ${savePath}.csv...`);
  session.exportToCSV(savePath);
  remote.dialog.showMessageBox(null, {
    type: 'info',
    buttons: ['OK'],
    title: 'Saved!',
    message: `Your transactions were successfully exported to ${savePath}.csv`
  });
});

function handleOpen() {
  const options = {
    defaultPath: remote.app.getPath('documents')
  };
  const getPaths = remote.dialog.showOpenDialog(null, options);
  if (getPaths === undefined) {
    return;
  }
  session.saveWallet(session.walletFile);
  const [wallet, error] = WalletBackend.openWalletFromFile(
    session.daemon,
    getPaths[0],
    ''
  );
  if (error && error.errorCode !== 5) {
    log.debug(`Failed to open wallet: ${error.toString()}`);
    remote.dialog.showMessageBox(null, {
      type: 'error',
      buttons: ['OK'],
      title: 'Error opening wallet!',
      message: error.toString()
    });
    return;
  }
  if (error !== undefined) {
    if (error.errorCode === 5) {
      log.debug('Login to wallet failed, firing event...');
      eventEmitter.emit('loginFailed');
    }
  }
  const selectedPath = getPaths[0];
  const savedSuccessfully = session.handleWalletOpen(selectedPath);
  if (savedSuccessfully === true) {
    session = null;
    session = new WalletSession();
    startWallet();
    eventEmitter.emit('refreshLogin');
    eventEmitter.emit('openNewWallet');
  } else {
    remote.dialog.showMessageBox(null, {
      type: 'error',
      buttons: ['OK'],
      title: 'Error opening wallet!',
      message: 'The wallet was not opened successfully. Try again.'
    });
  }
}

eventEmitter.on('sendNotification', function sendNotification(amount) {
  const notif = new window.Notification('Transaction Received!', {
    body: `You've just received ${amount} ${session.wallet.config.ticker}`
  });
});

ipcRenderer.on('handleOpen', handleOpen);
eventEmitter.on('handleOpen', handleOpen);

eventEmitter.on('initializeNewNode', function(
  password,
  daemonHost,
  daemonPort
) {
  session = null;
  session = new WalletSession(password, daemonHost, daemonPort);
  startWallet();
  eventEmitter.emit('newNodeConnected');
  session.firstLoadOnLogin = false;
});

eventEmitter.on('initializeNewSession', function(password) {
  session = null;
  session = new WalletSession(password);
  startWallet();
  eventEmitter.emit('openNewWallet');
});

function handleNew() {
  const options = {
    defaultPath: remote.app.getPath('documents')
  };
  const savePath = remote.dialog.showSaveDialog(null, options);
  if (savePath === undefined) {
    return;
  }
  session.saveWallet(session.walletFile);
  if (savedInInstallDir(savePath)) {
    remote.dialog.showMessageBox(null, {
      type: 'error',
      buttons: ['OK'],
      title: 'Can not save to installation directory',
      message:
        'You can not save the wallet in the installation directory. The windows installer will delete all files in the directory upon upgrading the application, so it is not allowed.'
    });
    return;
  }
  const createdSuccessfuly = session.handleNewWallet(savePath);
  if (createdSuccessfuly === false) {
    remote.dialog.showMessageBox(null, {
      type: 'error',
      buttons: ['OK'],
      title: 'Error saving wallet!',
      message:
        'The wallet was not created successfully. Check your directory permissions and try again.'
    });
  } else {
    remote.dialog.showMessageBox(null, {
      type: 'info',
      buttons: ['OK'],
      title: 'Created!',
      message:
        'Your new wallet was created successfully. Go to Wallet > Password and add a password to the wallet if desired.'
    });
    const savedSuccessfully = session.handleWalletOpen(savePath);
    if (savedSuccessfully === true) {
      session = null;
      session = new WalletSession();
      startWallet();
      eventEmitter.emit('refreshLogin');
      eventEmitter.emit('openNewWallet');
    } else {
      remote.dialog.showMessageBox(null, {
        type: 'error',
        buttons: ['OK'],
        title: 'Error opening wallet!',
        message: 'The wallet was not opened successfully. Try again.'
      });
    }
  }
}

ipcRenderer.on('handleNew', handleNew);
eventEmitter.on('handleNew', handleNew);

ipcRenderer.on('handleBackup', function(evt, route) {
  const publicAddress = session.wallet.getPrimaryAddress();
  const [
    privateSpendKey,
    privateViewKey
  ] = session.wallet.getPrimaryAddressPrivateKeys();
  const [mnemonicSeed, err] = session.wallet.getMnemonicSeed();
  log.debug(err);

  const msg =
    // eslint-disable-next-line prefer-template
    publicAddress +
    `\n\nPrivate Spend Key:\n\n` +
    privateSpendKey +
    `\n\nPrivate View Key:\n\n` +
    privateViewKey +
    `\n\nMnemonic Seed:\n\n` +
    mnemonicSeed +
    `\n\nPlease save these keys safely and securely. \nIf you lose your keys, you will not be able to recover your funds.`;

  const userSelection = remote.dialog.showMessageBox(null, {
    type: 'info',
    buttons: ['Copy to Clipboard', 'Cancel'],
    title: 'Seed',
    message: msg
  });
  if (userSelection === 0) {
    clipboard.writeText(msg);
  }
});

const store = configureStore();

const AppContainer = process.env.PLAIN_HMR ? Fragment : ReactHotAppContainer;

async function startWallet() {
  try {
    await session.wallet.start();
  } catch {
    log.debug('Password required, redirecting to login...');
  }
  eventEmitter.emit('gotNodeFee');
}

render(
  <AppContainer>
    <Root store={store} history={history} />
  </AppContainer>,
  document.getElementById('root')
);

if (module.hot) {
  module.hot.accept('./containers/Root', () => {
    // eslint-disable-next-line global-require
    const NextRoot = require('./containers/Root').default;
    render(
      <AppContainer>
        <NextRoot store={store} history={history} />
      </AppContainer>,
      document.getElementById('root')
    );
  });
}
