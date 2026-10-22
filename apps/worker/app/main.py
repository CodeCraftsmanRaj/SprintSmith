import logging
import time


def run() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    logging.info("SprintSmith worker started; ingestion loop is not enabled yet")
    while True:
        time.sleep(60)


if __name__ == "__main__":
    run()