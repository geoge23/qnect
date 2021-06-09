import express from 'express'
import ejs from 'ejs'
import { Config, Hass, StateChange} from './helpers'
import e from 'express';

(async () => {
    const app = express()
    app.set('view engine', 'ejs');

    const config = new Config()
    const state = {
        entities: {}
    }

    const setEntityState = ((entity: string, eState: any) => {
        state.entities[entity] = eState
    })

    const ha = new Hass({
        host: config.expect('hass.host'), 
        key: config.expect('hass.token'),
        whitelist: config.get('whitelist', [])
    })

    ha.on('ready', () => {
        ha.requestEntityStatuses();
    })

    ha.on('change', (e: StateChange) => {
        setEntityState(e.entity, {
            name: e.attributes.friendly_name,
            type: e.entity.split('.')[0],
            state: e.state,  
            softwareName: e.entity,
            color: e.attributes.rgb_color || (e.state === 'on' ? [218,205,17] : [0,0,0])
        })
    })

    app.get('/', (req, res) => {
        res.render('index.ejs', state)
    })

    app.post('/changeState', express.json(), (req, res) => {
        const { entity, state } = req.body;
        ha.setState(entity, state)
        res.status(200).send()
    })

    app.listen(process.env.PORT || config.get('http.port') || 8080)
})();
