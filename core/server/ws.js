// Minimal WebSocket server - no dependencies
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

class WebSocket extends EventEmitter {
  constructor(socket) {
    super();
    this.socket = socket;
    this.readyState = 1; // OPEN

    socket.on('data', data => this.handleData(data));
    socket.on('close', () => {
      this.readyState = 3;
      this.emit('close');
    });
    socket.on('error', () => this.close());
  }

  handleData(buffer) {
    // Parse WebSocket frame
    const firstByte = buffer[0];
    const opcode = firstByte & 0x0f;

    if (opcode === 0x8) { // Close
      this.close();
      return;
    }

    if (opcode === 0x9) { // Ping
      this.pong();
      return;
    }

    const secondByte = buffer[1];
    const isMasked = (secondByte & 0x80) !== 0;
    let payloadLength = secondByte & 0x7f;
    let offset = 2;

    if (payloadLength === 126) {
      payloadLength = buffer.readUInt16BE(2);
      offset = 4;
    } else if (payloadLength === 127) {
      payloadLength = Number(buffer.readBigUInt64BE(2));
      offset = 10;
    }

    const mask = isMasked ? buffer.slice(offset, offset + 4) : null;
    offset += isMasked ? 4 : 0;

    const payload = buffer.slice(offset, offset + payloadLength);

    if (isMasked) {
      for (let i = 0; i < payload.length; i++) {
        payload[i] ^= mask[i % 4];
      }
    }

    if (opcode === 0x1) { // Text
      this.emit('message', payload.toString('utf8'));
    }
  }

  send(data) {
    if (this.readyState !== 1) return;

    const payload = Buffer.from(data);
    const length = payload.length;
    let header;

    if (length < 126) {
      header = Buffer.alloc(2);
      header[0] = 0x81; // FIN + text
      header[1] = length;
    } else if (length < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x81;
      header[1] = 126;
      header.writeUInt16BE(length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x81;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(length), 2);
    }

    this.socket.write(Buffer.concat([header, payload]));
  }

  pong() {
    const frame = Buffer.alloc(2);
    frame[0] = 0x8a; // FIN + pong
    frame[1] = 0;
    this.socket.write(frame);
  }

  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    try {
      const frame = Buffer.alloc(2);
      frame[0] = 0x88; // FIN + close
      frame[1] = 0;
      this.socket.write(frame);
      this.socket.end();
    } catch {}
    this.emit('close');
  }
}

export class WebSocketServer extends EventEmitter {
  constructor(server) {
    super();
    server.on('upgrade', (req, socket) => this.handleUpgrade(req, socket));
  }

  handleUpgrade(req, socket) {
    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.destroy();
      return;
    }

    const accept = createHash('sha1')
      .update(key + GUID)
      .digest('base64');

    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      '', ''
    ].join('\r\n'));

    const ws = new WebSocket(socket);
    this.emit('connection', ws);
  }
}
