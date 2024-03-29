<img src="https://i.ibb.co/Bz1zg7J/qnect.png" height=100 />

# Qnect

## An alternative UI for Home Assistant

I developed this program to help my parents (who struggle with technology) with accessing Home Assistant. They found the endless Lovelace screens to be confusing, so I developed this to ease their experience while accessing the few entities they cared about. 

The interface only supports entities that have a distinct on/off state (switches, covers, lights) and climate controls. The entities can be configured in a config.yaml file, which the format is displayed below the screenshot. 

The server also requires access to a MongoDB installation for authentication. The format of the user documents is also shown below.

### Example Screenshot
![Screenshot](https://i.ibb.co/T03pP8k/qnect-smart-home-manager.png)

### Example Config
This config should be in the same directory as the index.ts and named config.yaml
```[language=yaml]
http:
  port: 80

whitelist:
  - light.hue_color_lamp_2
  - switch.beach_garage_door
  - cover.garage_door_opener
  - climate.thermostat_1_nativezone

mongo:
  uri: mongodb://user:password@example.com:27017/database-for-authentication

jwt:
  token: random-string-here

hass:
  host: wss://home-assistant.local/api/websocket
  token: long-lived-access-token

```

### Example MongoDB entry
This entry should be in a collection called users in your database
```[language=json]
{
    "permissions": [],
    "username": "your-username",
    "password": "password hashed with bcrypt",
    "meta": {},
}
```
Per-user entities can be enabled by adding "qnect.user" and "qnect.(name of entity)" to the user's permissions array (i.e. permissions: ["qnect.user", "qnect.cover.garage_door_opener"])
