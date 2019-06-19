/* eslint-disable react/button-has-type */
/* eslint-disable class-methods-use-this */
// @flow
import { remote, ipcRenderer } from 'electron';
import React, { Component } from 'react';
import ReactLoading from 'react-loading';
import { Redirect, Link } from 'react-router-dom';
import log from 'electron-log';
import { session } from '../reducers/index';
import navBar from './NavBar';
import routes from '../constants/routes';

type Props = {
  syncStatus: number,
  unlockedBalance: number,
  lockedBalance: number,
  transactions: Array<string>,
  handleSubmit: () => void,
  transactionInProgress: boolean,
  importseed: boolean,
  importkey: boolean
};

export default class Settings extends Component<Props> {
  props: Props;

  constructor(props?: Props) {
    super(props);
    this.state = {
      syncStatus: session.getSyncStatus(),
      unlockedBalance: session.getUnlockedBalance(),
      lockedBalance: session.getLockedBalance(),
      transactions: session.getTransactions(),
      transactionInProgress: false,
      importkey: false,
      importseed: false
    };
  }

  componentDidMount() {
    this.interval = setInterval(() => this.refresh(), 1000);
    ipcRenderer.on('importSeed', (evt, route) =>
      this.handleImportFromSeed(evt, route)
    );
    ipcRenderer.on('importKey', (evt, route) =>
      this.handleImportFromKey(evt, route)
    );
  }

  componentWillUnmount() {
    clearInterval(this.interval);
    ipcRenderer.off('importSeed', this.handleImportFromSeed);
    ipcRenderer.off('importKey', this.handleImportFromKey);
  }

  async handleSubmit(event) {
    // We're preventing the default refresh of the page that occurs on form submit
    event.preventDefault();
    const [sendToAddress, amount, paymentID, fee] = [
      event.target[0].value, // sendToAddress
      event.target[1].value, // amount
      event.target[2].value || undefined, // paymentID
      event.target[3].value || 0.1 // fee
    ];

    log.debug(sendToAddress);

  }

  handleImportFromSeed(evt, route) {
    clearInterval(this.interval);
    ipcRenderer.off('importSeed', this.handleImportFromSeed);
    this.setState({
      importseed: true
    });
  }

  handleImportFromKey(evt, route) {
    clearInterval(this.interval);
    ipcRenderer.off('importKey', this.handleImportFromKey);
    this.setState({
      importkey: true
    });
  }

  refresh() {
    this.setState(prevState => ({
      syncStatus: session.getSyncStatus(),
      unlockedBalance: session.getUnlockedBalance(),
      lockedBalance: session.getLockedBalance(),
      transactions: session.getTransactions()
    }));
  }

  render() {
    if (this.state.importkey === true) {
      return <Redirect to="/importkey" />;
    }

    if (this.state.importseed === true) {
      return <Redirect to="/import" />;
    }

    return (
      <div>
        {navBar('settings')}
        <div className="box has-background-light maincontent">
          <form onSubmit={this.handleSubmit}>
            <div class="field">
              <input id="switchColorSuccess" type="checkbox" name="switchColorSuccess" className="switch is-success" />
              <label for="switchColorSuccess">Scan coinbase transactions</label>
            </div>
            <div className="buttons">
              <button
                type="submit"
                className="button is-success is-large"
              >
                Save Changes
              </button>
              <button type="reset" className="button is-large">
                Discard
              </button>
            </div>
          </form>
        </div>
        <div className="box has-background-grey-lighter footerbar">
          <div className="field is-grouped is-grouped-multiline is-grouped-right">
            <div className="control">
              <div className="tags has-addons">
                <span className="tag is-white is-large">Balance:</span>
                <span className="tag is-info is-large">
                  {session.atomicToHuman(this.state.unlockedBalance, true)} TRTL
                </span>
              </div>
            </div>
            <div className="control">
              <div className="tags has-addons">
                <span className="tag is-white is-large">Sync:</span>
                {this.state.syncStatus < 100 && (
                  <span className="tag is-warning is-large">
                    {this.state.syncStatus}%
                    <ReactLoading
                      type="bubbles"
                      color="#363636"
                      height={30}
                      width={30}
                    />
                  </span>
                )}
                {this.state.syncStatus === 100 && (
                  <span className="tag is-success is-large">
                    {this.state.syncStatus}%
                  </span>
                )}
              </div>
            </div>
            <div className="control">
              <div className="tags has-addons">
                <span className="tag has-background-grey-lighter is-large is-right">
                  <Link className="settingslink" to={routes.SETTINGS}>
                    <span className="icon has-text-dark">
                      <i className="fa fa-cog" />
                    </span>
                  </Link>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}