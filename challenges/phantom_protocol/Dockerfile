FROM python:3.11-alpine
WORKDIR /chall
COPY server.py .
RUN adduser -D ctf
USER ctf
EXPOSE 9008
CMD ["python3", "server.py"]
