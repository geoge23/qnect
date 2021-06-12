import express from 'express'
import { Config, Hass, StateChange, User} from './helpers'
import mongoose from 'mongoose'
import JWT from 'jsonwebtoken'
import cparse from 'cookie-parser'
import bc from 'bcrypt'

(async () => {
    const app = express()
    app.set('view engine', 'ejs');
    app.use(cparse())

    const config = new Config()
    const state = {
        entities: {}
    }
    const sseUsers: [express.Response?] = [];
    
    mongoose.connect(process.env.MONGO_URI || config.expect('mongo.uri'), {
        useNewUrlParser: true,
        useUnifiedTopology: true
    })

    const setEntityState = ((entity: string, eState: any) => {
        state.entities[entity] = eState
        updateSse(eState)
    })

    const ha = new Hass({
        host: config.expect('hass.host'), 
        key: config.expect('hass.token'),
        whitelist: config.get('whitelist', [])
    })

    const JWTtoken = config.expect('jwt.token')

    const requireLogin = async (req, res, next) => {
        try {
            //@ts-ignore
            const {id} = JWT.verify(req.cookies['auth'], JWTtoken)
            //@ts-ignore
            req.user = await User.findOne({_id: id});
            next();
        } catch (e) {
            res.redirect('/login')
        }
    }

    ha.on('ready', () => {
        ha.requestEntityStatuses();
    })

    ha.on('change', (e: StateChange) => {
        setEntityState(e.entity, {
            name: e.attributes.friendly_name,
            type: e.entity.split('.')[0],
            state: coerceToBinaryStatus(e.state),  
            softwareName: e.entity,
            color: e.attributes.rgb_color || (e.state === 'on' ? [218,205,17] : [0,0,0])
        })
    })

    app.get('/', requireLogin, (req, res) => {
        //@ts-expect-error
        const perms: [string] = req.user.permissions
        if (perms.includes('qnect.user')) {
            const entities = Object(state.entities);
        
            for (const e in entities) {
                if (!perms.includes(`qnect.${e}`)) {
                    delete entities[e]
                }
            }

            //@ts-ignore
            res.render('index.ejs', {entities, name: req.user.username})
        } else {
            //@ts-ignore
            res.render('index.ejs', {...state, name: req.user.username})
        }
        
    })

    app.get('/logout', requireLogin, (req, res) => {
        res.clearCookie('auth');
        res.cookie('logout', 'logout')
        res.redirect('/login')
    })

    app.post('/changeState', requireLogin, express.json(), (req, res) => {
        const { entity, state } = req.body;
        //@ts-ignore
        if (req.user.permissions.includes('qnect.user') && !req.user.permissions.includes(`qnect.${entity}`)) {
            res.status(403).send('User does not have permission for this entity')
            return;
        }
        ha.setState(entity, state)
        res.status(200).send()
    })

    app.get('/login', express.json(), async (req, res) => {
        if (!req.header('Authorization') || req.cookies['logout']) {
            res.set('WWW-Authenticate', 'Basic realm=\'Please login to qnect\'')
            if (req.cookies['logout']) res.clearCookie('logout')
            res.status(401).send('<h1 style="font-family: Tahoma">Unauthorized</h1><a href="/login">Press to retry</a>')
            return;
        }
        const [username, password] = Buffer.from(req.get('Authorization').replace("Basic ", ""), 'base64').toString().split(':')
        const user = await User.findOne({username})
        if (!user) {
            res.status(401).send('<h1 style="font-family: Tahoma">Username incorrect</h1><a href="/login">Press to retry</a>')
            return;
        }
        //@ts-ignore
        if (await bc.compare(password, user.password)) {
            res.cookie(
                    'auth',
                    JWT.sign(
                        {id: user._id}, 
                        JWTtoken
                    )
                )
            res.redirect('/');
            return;
        } else {
            res.status(401).send('<h1 style="font-family: Tahoma">Password incorrect</h1><a href="/login">Press to retry</a>')
            return;
        }
    })

    app.get('/sse', requireLogin, (req, res) => {
        res.set({
            // 'Cache-Control': 'no-cache',
            'Content-Type': 'text/event-stream',
            'Connection': 'keep-alive',
            'Retry': '10000'
        });
        res.flushHeaders();
        res.write('\n\n');

        sseUsers.push(res);
    })

    function updateSse(message: any) {
        sseUsers.forEach(e => {
            e.write(`data: ${JSON.stringify(message)}\n\n`)
        })
    }

    const ON_WORDS = new Set(['open'])

    function coerceToBinaryStatus(status) {
        if (status == 'on' || status == 'off') {
            return status;
        }
        if (ON_WORDS.has(status)) {
            return 'on'
        } else {
            return 'off'
        }
    }

    app.listen(process.env.PORT || config.get('http.port') || 8080)
})();
