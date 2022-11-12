export class LPToken extends Snip20 {
  async getPairName(): Promise<string> {
    const { name } = await this.getTokenInfo();
    const fragments = name.split(" ");
    const [t0addr, t1addr] = fragments[fragments.length - 1].split("-");
    const t0 = this.agent!.getClient(Snip20, t0addr);
    const t1 = this.agent!.getClient(Snip20, t1addr);
    const [t0info, t1info] = await Promise.all([
      t0.getTokenInfo(),
      t1.getTokenInfo(),
    ]);
    return `${t0info.symbol}-${t1info.symbol}`;
  }
}
