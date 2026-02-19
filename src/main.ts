/**
 * Responsibility: Boots the web client and registers top-level routes.
 * It wires the lobby and room pages into the Vaadin Router outlet.
 */

import '@picocss/pico/css/pico.min.css';
import './styles.css';
import { Router } from '@vaadin/router';
import './ui/lobby-page';
import './ui/room-page';
import { initializeThemeMode } from './ui/theme';

initializeThemeMode();

const outlet = document.querySelector('#outlet');
const router = new Router(outlet);

router.setRoutes([
  { path: '/', component: 'lobby-page' },
  { path: '/room/:roomId', component: 'room-page' },
]);
