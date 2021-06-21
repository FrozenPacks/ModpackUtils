import * as core from '@actions/core';
import * as github from '@actions/github';
import { AxiosError } from 'axios';
import technicRelease from './technic';
import { createRelease, updateWeb } from './web';

function isAxiosError(e: any): e is AxiosError {
   return !!e.isAxiosError
}


async function run() {

   const action = core.getInput('action', { required: true })

   switch (action) {
      case 'web': return web()
      case 'technic': return technicRelease()
   }

   throw new Error(`Invalid action '${action}'`)

}

async function web() {

   if (github.context.eventName === 'release') {
      await createRelease(github.context.payload.release)
   }

   await updateWeb()

}

run().catch(e => {

   if (isAxiosError(e)) {
      console.error(`API Request failed: ${e.config.url}`)
      console.error(`   ${e.response?.data}`)
      throw e
   }

   core.setFailed(e.message)

})