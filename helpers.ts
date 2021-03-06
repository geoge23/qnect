import fs from 'fs'
const WebSocket = require('ws');
import EventEmitter from 'events'
import YAML from 'yaml'
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

const SWITCHABLE_ENTITIES = new Set(['switch', 'cover', 'light']);

const User = mongoose.model('users', {
    //@ts-ignore
    username: String,
    password: String,
    meta: Object,
    permissions: Array
})

class Config {
    private _config

    constructor(path?) {
        const fallbackPath = path || process.env.CONFIG || './config.yaml';
        this._config = YAML.parse(
            fs.readFileSync(fallbackPath).toString('utf-8')
        )
    }

    get(path: string, fallback?: any) {
        const splitPath = path.split('.');
        let configItem: any = this._config;
        try {
            splitPath.forEach(e => {
                configItem = configItem[e]
            })
        } catch (_) {
            return fallback
        }
        return configItem;
    }

    expect(path) {
        const item = this.get(path)
        if (item === null) {
            console.error(`Expected property ${path} but was not found. Please fill in this value`)
            process.exit(-1);
        } else {
            return item
        }
    }
}

interface HassMessage {
    id: number,
    type: string,
    [x: string]: any
}

interface StateChange {
    entity: string,
    state: string,
    attributes: any
}

class Hass extends EventEmitter {
    private _ws;
    private _key;
    private _whitelist: Set<string>;
    private lastId: number = 1;

    constructor({host, key, whitelist}: {host: string, key: string, whitelist?: Array<string>}) {
        super();
        this._whitelist = new Set(whitelist);
        this.connect(host, key);
    }

    private wsSend(object: any) {
        this.lastId += 1;
        this._ws.send(JSON.stringify(object))
    }

    private async connect(host: string, key: string) {
        this._ws = new WebSocket(host)
        this._key = key
        this._ws.on('message', ((m) => this.handleMessage(m)).bind(this))
        this._ws.on('error', ((e) => {
            console.log(`Error ${e} occurred on WebSocket, attempting to reconnect`)
            this.lastId = 1;
            this._ws = new WebSocket(host);
        }).bind(this))
    }

    private handleMessage(m: string) {
        const msg: HassMessage = JSON.parse(m)


        switch (msg.type) {
            case 'auth_required':
                this.wsSend({
                    type: 'auth',
                    "access_token": this._key
                })
                break;
            case 'auth_ok':
                this.emit('ready')
                this.wsSend({
                    id: this.lastId++,
                    type: "subscribe_events"
                })
                break;
            case 'event':
                this.assessEvent(msg);
                break;
            case 'result':
                this.parseResult(msg);
                break;
        }
    }

    private parseResult(msg: HassMessage) {
        if (!Array.isArray(msg.result)) return;
        msg.result.forEach(e => {
            if (this._whitelist.size <= 0 || this._whitelist.has(e.entity_id)) {
                const sc: StateChange = {
                    entity: e.entity_id,
                    state: e.state,
                    attributes: e.attributes
                }
                this.emit('change', sc);
            }
        });
    }

    private assessEvent(msg: HassMessage) {
        if (this._whitelist.size <= 0 || this._whitelist.has(msg.event.data.entity_id)) {
            const sc: StateChange = {
                entity: msg.event.data.entity_id,
                state: msg.event.data.new_state.state,
                attributes: msg.event.data.new_state.attributes
            }
            this.emit('change', sc);
        }
    }

    requestEntityStatuses() {
        if (this._ws.readyState === WebSocket.OPEN) {
            this.wsSend({
                id: this.lastId++,
                type: "get_states"
            })
        } else {
            throw new Error('Not connected to Home Assistant')
        }
    }

    toggleSwitchable(entity: string)  {
        this.wsSend({
            id: this.lastId++,
            type: "call_service",
            domain: entity.split('.')[0],
            service: 'toggle',
            service_data: {
                entity_id: entity
            }
        })
    }

    setClimateMode(entity: string, mode: string) {
        this.wsSend({
            id: this.lastId++,
            type: "call_service",
            domain: entity.split('.')[0],
            service: 'set_hvac_mode',
            service_data: {
                entity_id: entity,
                hvac_mode: mode
            }
        })
    }

    setClimateTemperature(entity: string, temperature: number) {
        this.wsSend({
            id: this.lastId++,
            type: "call_service",
            domain: entity.split('.')[0],
            service: 'set_temperature',
            service_data: {
                entity_id: entity,
                temperature
            }
        })
    }
}

export {Config, Hass, StateChange, User, SWITCHABLE_ENTITIES}