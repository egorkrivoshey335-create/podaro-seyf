import test from 'tape'

import { InSales } from '../src'

test('InSales', async t => {
  const insales = new InSales()

  t.ok(insales)

  t.pass()
})
