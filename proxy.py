from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
import requests

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ES_URL = "https://elastic-sac-test.elkaas.flex.com"
USERNAME = "flexh1smtmachinesdata-sac-tst-00589-service-user"
PASSWORD = "f*oA-4cj"

@app.post("/search")
async def search(req: Request):
    body = await req.json()

    res = requests.post(
        f"{ES_URL}/flexh1smtmachinesdata-tan_meng_kiang-*/_search",
        json=body,
        auth=(USERNAME, PASSWORD),
        headers={"Content-Type": "application/json"},
    )

    return res.json()