import { bridgeSend, getSyncResponse, web3Response } from "./messages";

declare global {
  interface Window {
    ReactNativeWebView: {
      postMessage(msg: string): void;
      onMessage(msg: string): void
    };
    ethereum: any,
    wootzappAppcurrentAccountAddress: string
    wootzappAppNetworkId: number
    wootzappAppDebug: boolean
  }
}

export let callbackId = 0
export let callbacks: { [key: number]: any } = {}

export function sendAPIrequest(permission: string, pars?: any) {
  const messageId = callbackId++
  const params = pars || {}

  bridgeSend({
    type: 'api-request',
    permission: permission,
    messageId: messageId,
    params: params
  })

  return new Promise(function (resolve, reject: any) {
    params['resolve'] = resolve
    params['reject'] = reject
    callbacks[messageId] = params
  })
}

export class WootzappAPI {
  getContactCode = () => {
    return sendAPIrequest('contact-code')
  }
}

export class EthereumProvider {
  isWootzapp = true
  isMetamask = false
  wootzapp = new WootzappAPI()
  isConnected = () => true

  networkVersion = window.wootzappAppNetworkId
  chainId = "0x" + Number(window.wootzappAppNetworkId).toString(16)
  networkId = window.wootzappAppNetworkId


  enable() {
    return sendAPIrequest('web3', { url: location.href })
  }

  scanQRCode(regex: string) {
    return sendAPIrequest('qr-code', { regex: regex })
  }

  sendAsync = (payload: any, callback: any) => {
    if (window.wootzappAppDebug) {
      console.log("sendAsync (legacy)" + JSON.stringify(payload))
    }
    if (!payload) {
      return new Error('Request is not valid.')
    }
    if (payload.method == 'eth_requestAccounts') {
      return sendAPIrequest('web3', { url: location.href })
    }
    const syncResponse = getSyncResponse(payload)
    if (syncResponse && callback) {
      callback(null, syncResponse)
    } else {
      const messageId = callbackId++

      if (Array.isArray(payload)) {
        callbacks[messageId] = {
          num: payload.length,
          results: [],
          callback: callback
        }
        for (const i in payload) {
          bridgeSend({
            type: 'web3-send-async-read-only',
            messageId: messageId,
            payload: payload[i]
          })
        }
      } else {
        callbacks[messageId] = { callback: callback }
        bridgeSend({
          type: 'web3-send-async-read-only',
          messageId: messageId,
          payload: payload
        })
      }
    }
  }

  sendSync = (payload: any) => {
    if (window.wootzappAppDebug) {
      console.log("sendSync (legacy)" + JSON.stringify(payload))
    }
    if (payload.method == "eth_uninstallFilter") {
      this.sendAsync(payload, function (res: any, err: any) {
      })
    }
    const syncResponse = getSyncResponse(payload)
    if (syncResponse) {
      return syncResponse
    } else {
      return web3Response(payload, null)
    }
  }

  request = (requestArguments: any) => {
    try {
      if (!requestArguments) {
        return new Error('Request is not valid.')
      }
      const method = requestArguments.method

      if (!method) {
        return new Error('Request is not valid.')
      }

      // Support for legacy send method
      if (typeof method !== 'string') {
        return this.sendSync(method)
      }

      if (method === 'eth_requestAccounts') {
        return sendAPIrequest('web3', { url: location.href })
      }

      const syncResponse = getSyncResponse({ method: method })
      if (syncResponse) {
        return new Promise(function (resolve, reject) {
          resolve(syncResponse.result)
        })
      }

      const messageId = callbackId++
      const payload = {
        id: messageId,
        jsonrpc: "2.0",
        method: method,
        params: requestArguments.params
      }

      bridgeSend({
        type: 'web3-send-async-read-only',
        messageId: messageId,
        payload: payload,
        meta: {
          url: location.href
        }
      })

      return new Promise(function (resolve, reject) {
        callbacks[messageId] = {
          beta: true,
          resolve: resolve,
          reject: reject
        }
      })
    } catch (e) {
      bridgeSend({ error: e })
    }
  }

  send = (method: any, params = []) => {
    if (window.wootzappAppDebug) {
      console.log("send (legacy): " + method)
    }
    return this.request({ method: method, params: params })
  }
  _events: any = {}
  on = (name: any, listener: any) => {
    if (!this._events[name]) {
      this._events[name] = []
    }
    this._events[name].push(listener)
  }

  removeListener = (name: any, listenerToRemove: any) => {
    if (!this._events[name]) {
      return
    }

    const filterListeners = (listener: any) => listener !== listenerToRemove
    this._events[name] = this._events[name].filter(filterListeners)
  }

  removeAllListeners = () => {
    this._events = []
  }

  emit = (name: any, data: any) => {
    if (!this._events[name]) {
      return
    }
    this._events[name].forEach((cb: any) => cb(data))
  }
}

window.ethereum = new EthereumProvider()







