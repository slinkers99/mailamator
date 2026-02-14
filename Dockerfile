FROM python:3.12-slim

RUN useradd -m -r mailamator
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /data && chown -R mailamator:mailamator /app /data
USER mailamator

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/')" || exit 1

CMD ["gunicorn", "-b", "0.0.0.0:8080", "app.main:app"]
