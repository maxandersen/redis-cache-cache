import { css, html } from 'lit';
import { BaseElement } from './base-element.js';
import { Places } from '../language/places.js';

class EventTicker extends BaseElement {
  static places = new Places();

  static styles = [
    BaseElement.styles,
    css`
      .ticker {
        margin: 0.5rem;
        padding: 0.5rem;
        overflow: scroll;
        width: 450px;
        max-height: 250px;
        position: absolute;
        z-index: 2;
        border: 1px lightgray solid;
        border-radius: 5px;
        box-shadow: rgba(50, 50, 93, 0.25) 0 2px 5px -1px,
          rgba(0, 0, 0, 0.3) 0px 1px 3px -1px;
      }

      ul {
        display: flex;
        flex-direction: column;
        list-style-type: none;
      }

      li {
        text-align: left;
        font-family: Courier, monospace;
        font-size: large;
      }

      .player {
        font-weight: bold;
        font-family: Handlee, fantasy;
        //background: #ffff00aa;
      }

      .place {
        //background: #00ff00aa;
      }
    `,
  ];

  render() {
    if (!this.events) {
      return html`
        <ul class="ticker">
          <li>Rien n'est encore arrivé ...</li>
        </ul>
      `;
    }

    return html`
      <ul class="ticker">
        ${this.events.map(
          entry => html` <li>${EventTicker.format(entry)}</li> `
        )}
      </ul>
    `;
  }

  static get properties() {
    return {
      events: {},
    };
  }

  static format(event) {
    const f = this.formatPlace(event.place);
    const span = html`<span class="player">${event.hider}</span>`;

    switch (event.kind) {
      case 'HIDER':
        return html` Oh, ${span} se cache ${f}.`;
      case 'NEW_GAME':
        return html`Le jeu commence.`;
      case 'PLAYER_DISCOVERED': {
        return html`Ah, <span class="player">${event.seeker}</span> a trouvé
          <span class="player">${event.hider}</span> ${this.formatPlace(
            event.place
          )}.`;
      }
      case 'SEEKER_MOVE': {
        return html`Ah, <span class="player">${event.seeker}</span> est allé
          ${this.formatPlace(event.destination)}.`;
      }
      case 'GAME_OVER': {
        const verb = event.seekerWon ? `a gagné` : `a perdu`;
        return html`<b>Jeu terminé.</b> L'attrapeur ${verb}!`;
      }

      default:
        return '';
    }
  }

  static formatPlace(place) {
    console.log('WILL FORMAT', place);
    const p = this.places.getPlace(place);
    if (!p) {
      return html`au <span class="place">${place}</span>`;
    }

    if (p?.name.startsWith('Le ')) {
      return html`${p.prefix}
        <span class="place">${p.name.replace('Le ', '')}</span>`;
    }
    if (p?.name.startsWith('Les ')) {
      return html`${p.prefix}
        <span class="place">${p.name.replace('Les ', '')}</span>`;
    }
    if (p.prefix.endsWith('’')) {
      return html`${p.prefix}<span class="place">${p.name}</span>`;
    }
    return html`${p.prefix} <span class="place">${p.name}</span>`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.openConnection();
  }

  onServerUpdate = event => {
    console.debug('Updating events:', event);
    if (!this.events) this.events = [];
    this.events.unshift(JSON.parse(event?.data));
    // Unshift doesn't trigger a rerender, so force an update
    this.requestUpdate('events');

    // We should perhaps handle closing in a graceful way
  };

  async openConnection() {
    // Server side events
    const eventSource = new EventSource('http://localhost:8091/games/events');
    eventSource.onmessage = this.onServerUpdate;
    eventSource.onopen = () => {
      console.log('Connected to game events.');
    };
    eventSource.onerror = err => {
      console.warn('Error:', err);
    };
  }
}

// Custom elements have to have a hyphen in the name, even in cases like this, where it doesn't really make sense
customElements.define('event-ticker', EventTicker);
