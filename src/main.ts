import { createApp } from 'vue'
import { createPinia } from 'pinia'
import 'leaflet/dist/leaflet.css'
import App from './App.vue'
import './styles/global.css'

createApp(App).use(createPinia()).mount('#app')
