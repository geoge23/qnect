import express from 'express'
import ejs from 'ejs'
import { Config, Hass, StateChange} from './helpers'

(async () => {
    const app = express()
    app.set('view engine', 'ejs');

    const config = new Config()
    const entities = {}

    const ha = new Hass({
        host: config.expect('hass.host'), 
        key: config.expect('hass.token'),
        whitelist: config.get('whitelist', [])
    })

    ha.on('ready', () => {
        ha.requestEntityStatuses();
    })

    ha.on('change', (e: StateChange) => {
        console.log(e)
    })

    app.get('/', (req, res) => {
        res.render('index.ejs', entities)
    })

    app.listen(process.env.PORT || config.get('http.port') || 8080)
})();