import { Firestore } from '@google-cloud/firestore'
import { EventStoreDBClient, JSONRecordedEvent } from '@eventstore/db-client'
import { EsdbToFirestoreProjector } from '../../eventstoredb-to-firestore-projector'
import { WeewooEvent } from '@toye.io/weewoo-event-definitions'

export const createProjector = async (
  connection: EventStoreDBClient,
  firestore: Firestore
): Promise<EsdbToFirestoreProjector> => {
  const handleEvent = async (
    event: JSONRecordedEvent,
    batch: FirebaseFirestore.WriteBatch
  ) => {
    if (
      ![
        'LGT92MessageReceivedWithLocation',
        'LGT92MessageReceivedWithoutLocation',
      ].includes(event.eventType) ||
      !event.streamId.startsWith('LGT92-')
    ) {
      return
    }

    const data = event.data as
      | WeewooEvent['LGT92MessageReceivedWithLocation']
      | WeewooEvent['LGT92MessageReceivedWithoutLocation']

    batch.set(
      firestore.collection('lora-device-information').doc(event.streamId),
      {
        batteryVoltage: data.batteryVoltage,
        isInAlarmState: data.isInAlarmState,
        lastReceivedAt: data.lora.receivedAtMs,
        lastRRSI: data.lora.baseStationRSSI,
        deviceEUI: data.lora.devEUI,
      },
      { merge: true }
    )

    if (event.eventType === 'LGT92MessageReceivedWithLocation') {
      const locationPayload = event.data as WeewooEvent['LGT92MessageReceivedWithLocation']

      batch.set(
        firestore.collection('lora-device-information').doc(event.streamId),
        {
          locationWGS84: {
            receivedAt: locationPayload.lora.receivedAtMs,
            lat: locationPayload.locationWGS84.lat,
            lng: locationPayload.locationWGS84.lng,
          },
        },
        { merge: true }
      )
    }
  }

  const projector = new EsdbToFirestoreProjector(
    'lora-device-information-projector',
    connection,
    firestore,
    handleEvent,
    {
      maxBatchSize: 100,
      maxQueueTimeMs: 1000,
      stopOnEncounteringEvent: {
        streamId: 'IntegrationTest',
        eventType: 'IntegrationTestEnded',
      },
    }
  )

  return projector
}
