# SDA HYMNAL | Lowerthirds Plugin

OBS & VMIX browser source plugin that displays lowerthirds for all SDA Hymns.

## Installing dependencies

```bash
pip install -r requirements.txt
```

## Running the Environment Setup

```bash

py -3.12 -m venv env # Ensure u have python3.12 & above
.\env\Scripts\activate # Activate the python environment
```

> [!IMPORTANT]
> **Incase of any issues**
> **Check installed Python versions**

```python
py -0

# Result below
 -3.12-64 *
# Other python versions
```

Incase those versions above are not found then please install `python3.12` using this link [Python3.12](https://www.python.org/downloads/release/python-3122/)

## Run HTTP Server

```bash
python server.py # Run the application server
```

## The control panel is at

```http
http://localhost:9999/control/index.html
```

## OBS or VMIX Setup

Add New Browser Source
URL:

```http
http://localhost:9999/overlays/lowerthird.html
```

Size:

```http
1920 -->width
1080 -->height
```

## Current Directory Structure

```bash
C:\hymnal-browser-plugin\
│
├─ server.py
├─ hymns\
├─ overlays\
│   └─ lowerthird.html
├─ control\
│   └─ index.html   ← Main Hymnal Control Panel
└─ assets\
    ├─ overlay.css
    └─ control.css
```

> Incase you have any feature requests, please make an issue and would love your contributions, thanks alot.

Made with love 💖 by @[vernonthedev](vernonthedev)
