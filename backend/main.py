"""Start the local backend: python main.py -> http://127.0.0.1:8765"""
import logging

import uvicorn
from fastapi import FastAPI

from src import config
from src.api import install_error_handlers, router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

app = FastAPI(title="Anladın mı? backend")
app.include_router(router)
install_error_handlers(app)


if __name__ == "__main__":
    uvicorn.run(app, host=config.HOST, port=config.PORT)
