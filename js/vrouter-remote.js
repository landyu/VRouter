const path = require('path')
class VRouterRemote {
  // todo: reconnect
  constructor (connect, config, local) {
    this.connect = connect
    this.config = config
    this.local = local
  }

  remoteExec (cmd) {
    const specialCmds = [
      '/etc/init.d/firewall restart'
    ]
    return new Promise((resolve, reject) => {
      this.connect.exec(cmd, (err, stream) => {
        let stdout = ''
        let stderr = ''
        if (err) reject(err)
        stream.on('data', (data) => {
          stdout += data
        })
        stream.stderr.on('data', (data) => {
          stderr += data
        })
        stream.on('end', () => {
          if (stderr) {
            if (specialCmds.includes(cmd)) {
              resolve(stderr.toString().trim())
            } else {
              reject(stderr.toString().trim())
            }
          } else {
            resolve(stdout.toString().trim())
          }
        })
      })
    })
  }

  initVM () {
    const src = path.join(this.config.host.configDir, 'third_party')
    const dst = this.config.vrouter.configDir
    return this.scp(src, dst)
      .then(() => {
      })
  }
  makeExecutable (file) {
    const cmd = `chmod +x ${file}`
    return this.remoteExec(cmd)
  }
  installKt () {
    const cmd = `tar -xvzf ${this.config.vrouter.configDir}/third_party/kcptun*.tar.gz ` +
      ` && rm server_linux_* && mv client_linux* /usr/bin/kcptun`
    return this.remoteExec(cmd)
  }
  installSS () {
    const cmd = `ls ${this.config.vrouter.configDir}/third_party/*.ipk | xargs opkg install`
    return this.remoteExec(cmd)
  }
  shutdown () {
    const cmd = 'poweroff'
    // do not return
    return Promise.resolve(this.remoteExec(cmd))
  }
  getSSOverKTProcess () {
    const cmd = 'ps | grep "[s]s-redir -c .*ss-over-kt.json"'
    return this.remoteExec(cmd)
  }
  getSSProcess () {
    // const cmd = 'ps | grep "[s]s-redir -c .*ss-client.json"'
    const cmd = 'ps | grep "[s]s-redir -c .*ss_client.json"'
    return this.remoteExec(cmd)
  }
  getSSDNSProcess () {
    const cmd = 'ps | grep "[s]s-tunnel -c .*ss-dns.json"'
    return this.remoteExec(cmd)
  }
  getSSVersion () {
    const cmd = 'ss-redir -h | grep "shadowsocks-libev" | cut -d" " -f2'
    return this.remoteExec(cmd)
  }
  getSSConfig () {
    return this.getFile(`${this.config.vrouter.configDir}/${this.config.shadowsocks.client}`)
  }
  getSSDNSConfig () {
    return this.getFile(`${this.config.vrouter.configDir}/${this.config.shadowsocks.dns}`)
  }
  getSSOverKTConfig () {
    return this.getFile(`${this.config.vrouter.configDir}/${this.config.shadowsocks.overKt}`)
  }

  getKTProcess () {
    const cmd = 'ps | grep "[k]cptun -c .*/kt-client.json"'
    return this.remoteExec(cmd)
  }
  getKTVersion () {
    const cmd = 'kcptun --version | cut -d" " -f3'
    return this.remoteExec(cmd)
  }

  getOSVersion () {
    const cmd = 'cat /etc/banner | grep "(*)" | xargs'
    return this.remoteExec(cmd)
  }
  getKTConfig () {
    return this.getFile(`${this.config.vrouter.configDir}/${this.config.kcptun.client}`)
  }

  getUptime () {
    return this.remoteExec('uptime')
  }

  getBrlan () {
    const cmd = 'ifconfig br-lan | grep "inet addr" | cut -d: -f2 | cut -d" " -f1'
    return this.remoteExec(cmd)
  }

  getWifilan () {
    const cmd = 'ifconfig eth1 | grep "inet addr" | cut -d: -f2 | cut -d" " -f1'
    return this.remoteExec(cmd)
  }

  getFile (file) {
    const cmd = `cat ${file}`
    return this.remoteExec(cmd)
  }
  getFWUsersRules () {
    return this.getFile(`/etc/${this.config.firewall.firewallFile}`)
  }

  restartFirewall () {
    const cmd = `/etc/init.d/firewall restart`
    return this.remoteExec(cmd)
  }
  restartDnsmasq () {
    const cmd = `/etc/init.d/dnsmasq restart`
    return this.remoteExec(cmd)
  }
  restartShadowsocks () {
    const cmd = '/etc/init.d/shadowsocks restart'
    return this.remoteExec(cmd)
  }
  restartKcptun () {
    const cmd = '/etc/init.d/kcptun restart'
    return this.remoteExec(cmd)
  }
  stopKcptun () {
    const cmd = '/etc/init.d/kcptun stop'
    return this.remoteExec(cmd)
  }
  async changeProtocol (p, m) {
    // TODO: must restart shadowsocks or kt
    const protocol = p || this.config.firewall.currentProtocol
    const mode = m || this.config.firewall.currentMode
    await this.local.generateConfig(protocol)
    await this.local.generateFWRules(mode, protocol, true)
    await this.local.scpConfig('shadowsocks')
    await this.local.scpConfig('firewall')
    await this.restartShadowsocks()
    await this.restartFirewall()
  }

  async changeMode (m, p) {
    const protocol = p || this.config.firewall.currentProtocol
    const mode = m || this.config.firewall.currentMode
    await Promise.all([
      this.local.generateIPsets(true),
      this.local.generateDnsmasqCf('whitelist', true),
      this.local.generateFWRules(mode, protocol, true)
    ])
    await Promise.all([
      this.local.scpConfig('ipset'),
      this.local.scpConfig('dnsmasq'),
      this.local.scpConfig('firewall')
    ])
    await Promise.all([
      this.restartFirewall(),
      this.restartDnsmasq()
    ])
    // await this.local.generateIPsets(true)
    // await this.local.scpConfig('ipset')
    // await this.local.generateDnsmasqCf(null, true)
    // await this.local.scpConfig('dnsmasq')
    // await this.local.generateFWRules(mode, protocol, true)
    // await this.local.scpConfig('firewall')
    // await this.restartFirewall()
    // await this.restartDnsmasq()
  }
  async changeSSConfig () {
    // await this.local.
  }
  close () {
    return new Promise((resolve) => {
      try {
        this.connect.end()
      } catch (err) {
        console.log(err)
        console.log('dont panic')
      }
      resolve()
    })
  }
}

module.exports = {
  VRouterRemote
}