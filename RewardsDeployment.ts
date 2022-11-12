class RewardsDeployment extends VersionedSubsystem<Version> {
  log = new SiennaConsole(`Rewards ${this.version}`)
  /** Which version of Auth Provider should these rewards use. */
  authVersion? = AuthVersions[this.version]
  /** The name of the auth provider, if used. */
  authProviderName = this.authVersion
    ? `Rewards[${this.version}]`
    : undefined
  /** The auth provider, if used. */
  auth = this.authVersion
    ? this.context.auth[this.authVersion].provider(this.authProviderName!)
    : null
  /** Which version of the AMM are these rewards for. */
  ammVersion = AMMVersions[this.version]
  /** The version of the Rewards client to use. */
  client: RewardsCtor = RewardPool[this.version] as unknown as RewardsCtor
  /** The reward pools in this deployment. */
  pools = this.contracts({ client: this.client, match: Names.isRewardPool(this.version) })

  constructor (
    context: SiennaDeployment,
    version: Version,
    /** The token distributed by the reward pools. */
    public reward: Contract<Snip20> = context.SIENNA
  ) {
    super(context, version)
    context.attach(this, `rewards ${version}`, `Sienna Rewards ${version}`)
  }

  async showStatus () {
    this.log.rewardPools(this.name, this.state)
  }
}
